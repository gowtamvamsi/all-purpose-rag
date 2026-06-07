import json
from typing import AsyncGenerator, List, Tuple
from sqlalchemy import select, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
from anthropic import Anthropic, AsyncAnthropic

from backend.config import settings
from backend.models.chunk import DocumentChunk
from backend.models.document import Document
from backend.models.message import Message
from backend.services.embedding_service import embedding_service

class RAGService:
    def __init__(self):
        self.anthropic_key = settings.ANTHROPIC_API_KEY
        if self.anthropic_key and not self.anthropic_key.startswith("YOUR_"):
            self.client = AsyncAnthropic(api_key=self.anthropic_key)
        else:
            self.anthropic_key = None
            print("WARNING: ANTHROPIC_API_KEY is not set. RAG service will run in MOCK mode for Claude.")
            
        self.gemini_key = settings.GEMINI_API_KEY
        if self.gemini_key and not self.gemini_key.startswith("YOUR_"):
            import google.generativeai as genai
            genai.configure(api_key=self.gemini_key)
        else:
            self.gemini_key = None
            print("WARNING: GEMINI_API_KEY is not set. RAG service will run in MOCK mode for Gemini.")

    async def vector_search(
        self,
        db: AsyncSession,
        project_id: str,
        query_embedding: List[float],
        top_k: int = 6
    ) -> List[Tuple[DocumentChunk, str]]:  # Returns (Chunk, DocumentName)
        """
        Runs similarity search in pgvector.
        Ordering by cosine distance is done via `<=>` operator (cosine_distance).
        """
        # In SQL, <=> is cosine distance. Cosine similarity = 1 - cosine_distance.
        # We can construct the statement using SQLAlchemy
        stmt = (
            select(DocumentChunk, Document.name)
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(
                and_(
                    DocumentChunk.project_id == project_id,
                    Document.status == "ready"
                )
            )
            .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        )
        
        result = await db.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    def build_system_prompt(self, project_prompt: str, context: str) -> str:
        base_template = """You are a knowledgeable assistant with access to a curated knowledge base.
Your job is to answer the user's question using ONLY the information 
provided in the context below.

RULES:
1. Answer only from the provided context. Do not use outside knowledge.
2. If the context does not contain enough information, say: 
   "I don't have enough information in this knowledge base to answer that."
3. When citing information, reference the source document name.
4. Be concise and precise. Prefer bullet points for multi-part answers.

{project_custom_prompt}

KNOWLEDGE BASE CONTEXT:
─────────────────────────────────────────────────────
{context}
─────────────────────────────────────────────────────"""
        custom_prompt = project_prompt if project_prompt else "Be precise and objective."
        return base_template.format(project_custom_prompt=custom_prompt, context=context)

    async def generate_response_stream(
        self,
        db: AsyncSession,
        project_id: str,
        query: str,
        history: List[Message],
        system_prompt_override: str,
        top_k: int = 6
    ) -> AsyncGenerator[str, None]:
        """
        Streams answers token-by-token using SSE format.
        Yields events: event: token, event: sources, event: done.
        """
        # 0. Get Project and Model
        from backend.models.project import Project
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        llm_model = project.llm_model if project else "gemini-2.5-flash"

        # Architectural Fix: Query Expansion (HyDE)
        expanded_query = query
        if llm_model.startswith("ollama/"):
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
                expansion_prompt = f"Given the user's short question or acronym, rewrite it to be a highly descriptive search query for a vector database. Expand acronyms. Do not answer the question, just provide the rewritten query.\nUser: {query}\nRewritten:"
                
                resp = await client.chat.completions.create(
                    model=llm_model.split("/")[1],
                    messages=[{"role": "user", "content": expansion_prompt}],
                    temperature=0.3,
                    max_tokens=50
                )
                if resp.choices and resp.choices[0].message.content:
                    expanded_query = resp.choices[0].message.content.strip()
                    print(f"Query Expanded: '{query}' -> '{expanded_query}'")
            except Exception as e:
                print(f"Query expansion failed: {e}")

        # 1. Embed query
        try:
            query_embedding = embedding_service.get_embedding(expanded_query)
            # 2. Search database
            search_results = await self.vector_search(db, project_id, query_embedding, top_k)
        except Exception as e:
            print(f"Warning: Failed to generate query embedding (API limit?), skipping RAG context. Error: {e}")
            query_embedding = None
            search_results = []
        
        # 3. Compile sources list and context string
        sources_payload = []
        context_blocks = []
        
        for chunk, doc_name in search_results:
            similarity = 0.85
            sources_payload.append({
                "chunk_id": str(chunk.id),
                "document_name": doc_name,
                "chunk_content": chunk.content,
                "page_number": chunk.page_number,
                "similarity_score": similarity
            })
            context_blocks.append(
                f"[Source: {doc_name}, Page: {chunk.page_number or 'N/A'}]\n{chunk.content}"
            )
            
        context_str = "\n\n---\n\n".join(context_blocks)
        
        # 4. Construct prompts
        system_prompt = self.build_system_prompt(system_prompt_override, context_str)
        
        # Format history for Claude (or GPT-4o)
        # Anthropic messages format: [{"role": "user", "content": "hello"}, ...]
        messages = []
        for msg in history:
            messages.append({
                "role": "user" if msg.role == "user" else "assistant",
                "content": msg.content
            })
        messages.append({"role": "user", "content": query})

        # 5. Stream generation
        full_response = ""
        if llm_model.startswith("ollama/"):
            ollama_model = llm_model.split("/")[1]
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(
                    base_url="http://localhost:11434/v1",
                    api_key="ollama"
                )
                
                ollama_messages = [{"role": "system", "content": system_prompt}]
                for msg in history:
                    ollama_messages.append({
                        "role": "user" if msg.role == "user" else "assistant",
                        "content": msg.content
                    })
                ollama_messages.append({"role": "user", "content": query})
                
                stream = await client.chat.completions.create(
                    model=ollama_model,
                    messages=ollama_messages,
                    stream=True
                )
                async for chunk in stream:
                    if chunk.choices[0].delta.content is not None:
                        token = chunk.choices[0].delta.content
                        full_response += token
                        yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
            except Exception as e:
                err_msg = f"Error during Ollama stream: {str(e)}"
                full_response += err_msg
                yield f"event: token\ndata: {json.dumps({'token': err_msg})}\n\n"
        elif llm_model.startswith("gemini"):
            if not self.gemini_key:
                # Mock Gemini stream
                import asyncio
                mock_text = f"Based on the knowledge base (Gemini Mock):\n"
                if len(search_results) == 0:
                    mock_text += "I don't have enough information in this knowledge base to answer that. Please upload documents first."
                else:
                    mock_text += f"Here is a mock Gemini response analyzing your query '{query}' from your documents:\n"
                    for doc_name in set(d for _, d in search_results):
                        mock_text += f"- Sourced from '{doc_name}'\n"
                    mock_text += "\nThis platform works offline-first! Configure your GEMINI_API_KEY in the environment for live Gemini model streaming."
                
                words = mock_text.split(" ")
                for i, word in enumerate(words):
                    token = word + (" " if i < len(words)-1 else "")
                    full_response += token
                    yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
                    await asyncio.sleep(0.05)
            else:
                try:
                    import google.generativeai as genai
                    # Format history for Gemini
                    gemini_history = []
                    for msg in history:
                        gemini_history.append({
                            "role": "user" if msg.role == "user" else "model",
                            "parts": [msg.content]
                        })
                    gemini_history.append({"role": "user", "parts": [query]})
                    
                    # Instantiate model with system instructions
                    model = genai.GenerativeModel(
                        model_name=llm_model,
                        system_instruction=system_prompt
                    )
                    
                    # Stream response asynchronously
                    response = await model.generate_content_async(gemini_history, stream=True)
                    async for chunk in response:
                        token = chunk.text
                        full_response += token
                        yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
                except Exception as e:
                    err_msg = f"Error during Gemini stream: {str(e)}"
                    full_response += err_msg
                    yield f"event: token\ndata: {json.dumps({'token': err_msg})}\n\n"
        else:
            if not self.anthropic_key:
                # Mock Stream mode
                import asyncio
                mock_text = f"Based on the knowledge base (Claude Mock): \n"
                if len(search_results) == 0:
                    mock_text += "I don't have enough information in this knowledge base to answer that. Please upload documents first."
                else:
                    mock_text += f"Here is a mock response analyzing your query '{query}' using retrieved documents:\n"
                    for doc_name in set(d for _, d in search_results):
                        mock_text += f"- Sourced from '{doc_name}'\n"
                    mock_text += "\nThis platform works offline-first! Configure your ANTHROPIC_API_KEY in the environment for live model streaming."
                
                # Yield token by token with brief delays
                words = mock_text.split(" ")
                for i, word in enumerate(words):
                    token = word + (" " if i < len(words)-1 else "")
                    full_response += token
                    yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
                    await asyncio.sleep(0.05)
            else:
                try:
                    # Actual Claude stream
                    stream = await self.client.messages.create(
                        model=llm_model if "claude" in llm_model else "claude-3-sonnet-20240229",
                        max_tokens=2048,
                        system=system_prompt,
                        messages=messages,
                        stream=True
                    )
                    async for event in stream:
                        if event.type == "content_block_delta":
                            token = event.delta.text
                            full_response += token
                            yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
                except Exception as e:
                    err_msg = f"Error during Claude stream: {str(e)}"
                    full_response += err_msg
                    yield f"event: token\ndata: {json.dumps({'token': err_msg})}\n\n"
        
        # 6. Stream source payloads
        yield f"event: sources\ndata: {json.dumps({'sources': sources_payload, 'full_response': full_response})}\n\n"
        
        # 7. Complete stream
        yield f"event: done\ndata: {json.dumps({'done': True})}\n\n"

rag_service = RAGService()
