"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { 
  FileText, Upload, RefreshCw, Trash2, ArrowUpRight, 
  CheckCircle, AlertTriangle, Loader2, Plus, Sparkles, MessageSquare 
} from "lucide-react";

interface Document {
  id: string;
  name: string;
  file_type: string;
  file_size_bytes: number;
  status: string;
  error_message: string | null;
  chunk_count: number;
  page_count: number | null;
  created_at: string;
}

export default function ProjectHome() {
  const params = useParams();
  const router = useRouter();
  const { token, apiFetch } = useAppStore();
  
  const projectId = params.projectId as string;
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importUrl, setImportUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [importUrlError, setImportUrlError] = useState("");
  const [importUrlSuccess, setImportUrlSuccess] = useState("");

  const fetchDocuments = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await apiFetch(`/projects/${projectId}/documents`);
      setDocuments(data);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (token && projectId) {
      fetchDocuments(true);
    }
  }, [token, projectId]);

  // Set up background polling if any document is in 'uploading' or 'processing' status
  useEffect(() => {
    const hasProcessing = documents.some(
      doc => doc.status === "uploading" || doc.status === "processing"
    );
    
    if (!hasProcessing) return;

    const timer = setInterval(() => {
      fetchDocuments(false);
    }, 2500); // Poll every 2.5 seconds

    return () => clearInterval(timer);
  }, [documents]);

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await uploadFiles(Array.from(files));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFiles(Array.from(files));
    }
  };

  const uploadFiles = async (fileList: File[]) => {
    setUploading(true);
    setUploadError("");
    
    const formData = new FormData();
    fileList.forEach(file => {
      formData.append("files", file);
    });

    try {
      const res = await fetch(`/api/v1/projects/${projectId}/documents/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to upload files");
      }
      
      // Refresh documents
      await fetchDocuments(false);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file(s)");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUrlImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    
    setImportingUrl(true);
    setImportUrlError("");
    setImportUrlSuccess("");
    
    try {
      await apiFetch(`/projects/${projectId}/documents/import-url`, {
        method: "POST",
        body: JSON.stringify({ url: importUrl.trim() })
      });
      
      setImportUrlSuccess("Started scraping page and downloading PDFs in the background. Discovered files will appear below shortly.");
      setImportUrl("");
      
      // Force refresh documents after 2 seconds
      setTimeout(() => fetchDocuments(false), 2000);
    } catch (err: any) {
      setImportUrlError(err.message || "Failed to start URL import");
    } finally {
      setImportingUrl(false);
    }
  };

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document? All associated chunks and vector embeddings will be permanently removed.")) {
      return;
    }

    try {
      await apiFetch(`/projects/${projectId}/documents/${docId}`, {
        method: "DELETE"
      });
      setDocuments(documents.filter(d => d.id !== docId));
    } catch (err) {
      console.error("Failed to delete document:", err);
      alert("Failed to delete document");
    }
  };

  const handleReprocess = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/projects/${projectId}/documents/${docId}/reprocess`, {
        method: "POST"
      });
      fetchDocuments(false);
    } catch (err) {
      console.error("Failed to reprocess document:", err);
    }
  };

  const startNewChat = async () => {
    try {
      const conv = await apiFetch(`/projects/${projectId}/conversations`, {
        method: "POST",
        body: JSON.stringify({ title: "New Conversation" }),
      });
      // Fire custom event to refresh layouts list
      window.dispatchEvent(new Event("refresh-conversations"));
      router.push(`/projects/${projectId}/chat/${conv.id}`);
    } catch (err) {
      console.error("Failed to start chat:", err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold border border-green-500/20">
            <CheckCircle className="h-3 w-3" />
            <span>Ready</span>
          </span>
        );
      case "processing":
      case "uploading":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-xs font-semibold border border-purple-500/20">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{status === "uploading" ? "Uploading" : "Processing"}</span>
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs font-semibold border border-red-500/20">
            <AlertTriangle className="h-3 w-3" />
            <span>Error</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-6xl mx-auto selection:bg-purple-500 selection:text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Documents Ingestion</h1>
          <p className="text-xs text-slate-400 mt-1">Upload and index files to ground your project knowledge base</p>
        </div>
        
        {documents.some(d => d.status === "ready") && (
          <button
            onClick={startNewChat}
            className="flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-2 px-5 rounded-lg shadow-lg shadow-purple-500/10 hover:scale-105 active:scale-95 transition-all text-xs"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Ask Questions</span>
          </button>
        )}
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className="glass-panel p-10 rounded-xl border border-dashed border-slate-800 hover:border-purple-500/40 hover:bg-slate-900/40 cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden"
      >
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/png,image/jpeg,image/webp"
        />

        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-400">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <Upload className="h-8 w-8" />
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-bold text-slate-200">
            {uploading ? "Uploading files..." : "Drag and drop your files here, or click to browse"}
          </p>
          <p className="text-xs text-slate-500 leading-normal max-w-sm">
            Accepts PDF, Word (.docx), PowerPoint (.pptx), text (.txt, .md), spreadsheet (.csv), and images (.png, .jpg, .webp) up to 50 MB
          </p>
        </div>

        {uploadError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
            {uploadError}
          </div>
        )}
      </div>

      {/* URL Import Form */}
      <form onSubmit={handleUrlImport} className="glass-panel p-6 rounded-xl border border-slate-800/80 space-y-4">
        <div className="flex flex-col space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Import PDFs from Website URL
          </label>
          <p className="text-[11px] text-slate-500">
            Provide a web page URL (e.g. `https://www.archives.gov/research/jfk/release-2025`). We will scan it, extract all PDF links, and download them automatically.
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <input
            type="text"
            placeholder="https://example.com/documents-page"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            disabled={importingUrl}
            className="flex-1 bg-slate-950/60 border border-slate-800 focus:border-purple-500/50 rounded-lg px-4 py-2 text-xs font-semibold text-slate-200 focus:outline-none transition-all placeholder:text-slate-600"
          />
          <button
            type="submit"
            disabled={importingUrl || !importUrl.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-white font-bold py-2 px-5 rounded-lg text-xs hover:scale-105 active:scale-95 disabled:scale-100 disabled:text-slate-600 transition-all flex items-center space-x-2 shrink-0 shadow-lg shadow-purple-500/5"
          >
            {importingUrl ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                <span>Import URL</span>
              </>
            )}
          </button>
        </div>
        
        {importUrlError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
            {importUrlError}
          </div>
        )}
        
        {importUrlSuccess && (
          <div className="text-xs text-emerald-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg">
            {importUrlSuccess}
          </div>
        )}
      </form>

      {/* Document Ingested List Table */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Indexed Documents</h3>
        
        {loading && documents.length === 0 ? (
          <div className="glass-panel py-12 rounded-xl flex items-center justify-center">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <span className="text-slate-500 text-xs font-semibold">Loading documents list...</span>
            </div>
          </div>
        ) : documents.length === 0 ? (
          <div className="glass-panel p-12 rounded-xl text-center text-slate-500 text-xs leading-normal">
            No documents uploaded to this project yet.<br />Add files above to initialize the knowledge base context.
          </div>
        ) : (
          <div className="glass-panel rounded-xl overflow-hidden border border-slate-850">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-4">Name</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Size</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Chunks</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-4 font-semibold text-slate-200">
                        <div className="flex flex-col max-w-sm truncate pr-2">
                          <span className="truncate" title={doc.name}>{doc.name}</span>
                          {doc.error_message && (
                            <span className="text-[10px] text-red-400 mt-1 block max-w-xs truncate leading-normal" title={doc.error_message}>
                              {doc.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-slate-400 font-semibold uppercase">{doc.file_type}</td>
                      <td className="p-4 text-slate-400">{formatBytes(doc.file_size_bytes)}</td>
                      <td className="p-4">{getStatusBadge(doc.status)}</td>
                      <td className="p-4 text-center font-bold text-slate-300">
                        {doc.status === "ready" ? doc.chunk_count : "—"}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {doc.status === "error" && (
                            <button
                              onClick={(e) => handleReprocess(doc.id, e)}
                              className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-md transition-colors"
                              title="Retry Processing"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDelete(doc.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                            title="Delete File"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
