"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { 
  Send, Loader2, ArrowLeft, MessageSquare, Compass, 
  FileText, Sparkles, BookOpen, ChevronDown, ChevronUp, AlertCircle 
} from "lucide-react";

interface MessageSource {
  document_name: string;
  chunk_content: string;
  page_number: number | null;
  similarity_score: number;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  sources?: MessageSource[];
}

export default function ChatView() {
  const params = useParams();
  const router = useRouter();
  const { token, apiFetch } = useAppStore();

  const projectId = params.projectId as string;
  const convId = params.convId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Streaming states
  const [streamingText, setStreamingText] = useState("");
  const [streamingSources, setStreamingSources] = useState<MessageSource[]>([]);

  // Expandable sources panels
  const [expandedSources, setExpandedSources] = useState<Record<number, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  const loadMessages = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/projects/${projectId}/conversations/${convId}/messages`);
      setMessages(data);
    } catch (err: any) {
      console.error("Failed to load chat history:", err);
      setError("Failed to load chat messages.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && projectId && convId) {
      loadMessages();
      setStreamingText("");
      setStreamingSources([]);
    }
  }, [token, projectId, convId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || submitting) return;

    const userText = inputText;
    setInputText("");
    setSubmitting(true);
    setError("");
    setStreamingText("");
    setStreamingSources([]);

    // 1. Add user message locally
    const newUserMsg: Message = { role: "user", content: userText };
    setMessages(prev => [...prev, newUserMsg]);

    try {
      // 2. Fetch SSE streaming endpoint
      const response = await fetch(
        `/api/v1/projects/${projectId}/conversations/${convId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ content: userText }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to stream message");
      }

      // Read SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let currentResponseText = "";
      let chunkBuffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunkBuffer += decoder.decode(value, { stream: true });

        // Split blocks by double-newlines
        const blocks = chunkBuffer.split("\n\n");
        // Keep the last block in case it's incomplete
        chunkBuffer = blocks.pop() || "";

        for (const block of blocks) {
          if (!block.trim()) continue;
          const lines = block.split("\n");
          let event = "";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              event = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.slice(6).trim();
            }
          }

          if (event === "token" && dataStr) {
            const data = jsonParseSafe(dataStr);
            if (data && data.token) {
              currentResponseText += data.token;
              setStreamingText(currentResponseText);
            }
          } else if (event === "sources" && dataStr) {
            const data = jsonParseSafe(dataStr);
            if (data && data.sources) {
              setStreamingSources(data.sources);
            }
          }
        }
      }

      // Refresh full message list from DB to get completed message IDs and citations
      const refreshedMessages = await apiFetch(`/projects/${projectId}/conversations/${convId}/messages`);
      setMessages(refreshedMessages);
      setStreamingText("");
      setStreamingSources([]);
      
      // Emit event to update sidebar conversation titles
      window.dispatchEvent(new Event("refresh-conversations"));
    } catch (err: any) {
      setError(err.message || "Failed to send message.");
    } finally {
      setSubmitting(false);
    }
  };

  const jsonParseSafe = (str: string) => {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  };

  const toggleSourceExpand = (index: number) => {
    setExpandedSources(prev => ({ ...prev, [index]: !prev[index] }));
  };

  if (!token || loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950/20">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <span className="text-slate-500 text-xs font-semibold">Loading chat window...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950/10 selection:bg-purple-500 selection:text-white">
      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
        {messages.length === 0 && !streamingText && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-400">
              <MessageSquare className="h-8 w-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-md font-bold text-slate-200">Start Project Chat</h3>
              <p className="text-xs text-slate-400 leading-normal">
                Ask questions in natural language. Answers are computed solely from the documents uploaded to this workspace.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} space-y-2`}>
            {/* Sender Label */}
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-1.5">
              {msg.role === "user" ? "You" : "Assistant"}
            </span>

            {/* Content Card */}
            <div className={`p-4 rounded-2xl max-w-2xl leading-relaxed text-sm ${
              msg.role === "user"
                ? "bg-purple-650 text-slate-100 rounded-tr-none shadow-md shadow-purple-650/5"
                : "bg-slate-900/60 border border-slate-850/60 rounded-tl-none"
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              
              {/* Citations section */}
              {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-slate-800/80 space-y-2.5">
                  <button
                    onClick={() => toggleSourceExpand(index)}
                    className="flex items-center space-x-1.5 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Sources ({msg.sources.length})</span>
                    {expandedSources[index] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {expandedSources[index] && (
                    <div className="grid gap-2.5 pt-1.5">
                      {msg.sources.map((src, sIdx) => (
                        <div key={sIdx} className="p-3 bg-slate-950/40 border border-slate-850 rounded-lg space-y-2 text-xs">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span className="truncate pr-4 flex items-center space-x-1">
                              <FileText className="h-3 w-3 text-blue-400" />
                              <span className="truncate" title={src.document_name}>{src.document_name}</span>
                            </span>
                            {src.page_number && <span className="shrink-0">Page {src.page_number}</span>}
                          </div>
                          <p className="text-slate-400 leading-normal italic bg-slate-950/20 p-2 rounded">
                            "{src.chunk_content}"
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Live Streaming Message Box */}
        {streamingText && (
          <div className="flex flex-col items-start space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-1.5">
              Assistant
            </span>
            <div className="p-4 rounded-2xl max-w-2xl leading-relaxed text-sm bg-slate-900/60 border border-slate-850/60 rounded-tl-none">
              <p className="whitespace-pre-wrap streaming-cursor">{streamingText}</p>

              {/* Streaming Citations */}
              {streamingSources.length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-slate-800/80 space-y-2.5">
                  <button
                    onClick={() => toggleSourceExpand(999999)}
                    className="flex items-center space-x-1.5 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Sources ({streamingSources.length})</span>
                    {expandedSources[999999] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {expandedSources[999999] && (
                    <div className="grid gap-2.5 pt-1.5">
                      {streamingSources.map((src, sIdx) => (
                        <div key={sIdx} className="p-3 bg-slate-950/40 border border-slate-850 rounded-lg space-y-2 text-xs">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span className="truncate pr-4 flex items-center space-x-1">
                              <FileText className="h-3 w-3 text-blue-400" />
                              <span className="truncate" title={src.document_name}>{src.document_name}</span>
                            </span>
                            {src.page_number && <span className="shrink-0">Page {src.page_number}</span>}
                          </div>
                          <p className="text-slate-400 leading-normal italic bg-slate-950/20 p-2 rounded">
                            "{src.chunk_content}"
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {submitting && !streamingText && (
          <div className="flex items-center space-x-2 text-slate-500 text-xs px-2">
            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
            <span>Retrieving contexts and reasoning answers...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center space-x-2 text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Footer */}
      <div className="p-4 md:p-6 border-t border-slate-850 shrink-0 bg-slate-950/20">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center space-x-3">
          <input
            type="text"
            required
            disabled={submitting}
            placeholder="Ask a question about your project files..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 px-4 py-3 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={submitting || !inputText.trim()}
            className="p-3 bg-purple-650 hover:bg-purple-500 text-white rounded-xl shadow-lg shadow-purple-600/10 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
