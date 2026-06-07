import random
from openai import OpenAI
from backend.config import settings

class EmbeddingService:
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.gemini_key = settings.GEMINI_API_KEY
        self.mode = "mock"
        print("WARNING: Forced MOCK mode for embeddings due to API rate limits.")

    def get_embedding(self, text: str) -> list[float]:
        if self.mode == "mock":
            random.seed(hash(text))
            return [random.uniform(-0.1, 0.1) for _ in range(1536)]
            
        if self.mode == "gemini":
            try:
                result = self.genai.embed_content(
                    model="models/gemini-embedding-001",
                    content=text.replace("\n", " ")
                )
                emb = result['embedding']
                # Pad or truncate to 1536 to match pgvector schema
                if len(emb) > 1536:
                    emb = emb[:1536]
                if len(emb) < 1536:
                    emb = emb + [0.0] * (1536 - len(emb))
                return emb
            except Exception as e:
                print(f"Error calling Gemini embedding API: {e}")
                raise e

        try:
            response = self.client.embeddings.create(
                model="text-embedding-3-small",
                input=[text.replace("\n", " ")]
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error calling OpenAI embedding API: {e}")
            raise e

    def get_embeddings_batched(self, texts: list[str]) -> list[list[float]]:
        if self.mode == "mock":
            results = []
            for t in texts:
                random.seed(hash(t))
                results.append([random.uniform(-0.1, 0.1) for _ in range(1536)])
            return results

        if self.mode == "gemini":
            import time
            from google.api_core.exceptions import ResourceExhausted
            
            embeddings = []
            batch_size = 100
            for i in range(0, len(texts), batch_size):
                batch = [t.replace("\n", " ") for t in texts[i:i+batch_size]]
                
                max_retries = 10
                for attempt in range(max_retries):
                    try:
                        result = self.genai.embed_content(
                            model="models/gemini-embedding-001",
                            content=batch
                        )
                        
                        if isinstance(result['embedding'][0], float):
                            if len(batch) == 1:
                                emb_batch = [result['embedding']]
                            else:
                                emb_batch = result['embedding']
                        else:
                            emb_batch = result['embedding']
                            
                        for emb in emb_batch:
                            if len(emb) > 1536:
                                emb = emb[:1536]
                            if len(emb) < 1536:
                                emb = emb + [0.0] * (1536 - len(emb))
                            embeddings.append(emb)
                        break # Success, break out of retry loop
                    except ResourceExhausted as e:
                        if attempt < max_retries - 1:
                            print(f"Embedding API rate limited (429). Waiting 60s before retry {attempt+1}/{max_retries}...")
                            time.sleep(60)
                        else:
                            print(f"Error calling Gemini embedding API (exhausted retries): {e}")
                            raise e
                    except Exception as e:
                        print(f"Error calling Gemini embedding API: {e}")
                        raise e
            return embeddings
            
        try:
            embeddings = []
            batch_size = 100
            for i in range(0, len(texts), batch_size):
                batch = [t.replace("\n", " ") for t in texts[i:i+batch_size]]
                response = self.client.embeddings.create(
                    model="text-embedding-3-small",
                    input=batch
                )
                embeddings.extend([data.embedding for data in response.data])
            return embeddings
        except Exception as e:
            print(f"Error calling OpenAI embedding API: {e}")
            raise e

embedding_service = EmbeddingService()
