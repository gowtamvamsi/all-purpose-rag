"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { Settings, Save, Trash2, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

interface Project {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  llm_model: string;
  retrieval_top_k: number;
}

export default function ProjectSettings() {
  const params = useParams();
  const router = useRouter();
  const { token, apiFetch } = useAppStore();
  
  const projectId = params.projectId as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [topK, setTopK] = useState(6);

  useEffect(() => {
    const fetchProject = async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/projects/${projectId}`);
        setProject(data);
        setName(data.name);
        setDescription(data.description || "");
        setPrompt(data.system_prompt || "");
        setModel(data.llm_model);
        setTopK(data.retrieval_top_k);
      } catch (err) {
        console.error("Failed to load project details:", err);
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    if (token && projectId) {
      fetchProject();
    }
  }, [token, projectId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setSaveSuccess(false);
    setError("");

    try {
      const data = await apiFetch(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description: description || null,
          system_prompt: prompt || null,
          llm_model: model,
          retrieval_top_k: topK
        })
      });
      
      setProject(data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000); // clear banner after 3 seconds
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this project? All documents, chunk embeddings, and conversations will be permanently lost.")) {
      return;
    }

    try {
      await apiFetch(`/projects/${projectId}`, {
        method: "DELETE"
      });
      router.push("/dashboard");
    } catch (err) {
      console.error("Failed to delete project:", err);
      alert("Failed to delete project");
    }
  };

  if (!token || loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950/20">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <span className="text-slate-500 text-xs font-semibold">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-3xl mx-auto selection:bg-purple-500 selection:text-white">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-100 flex items-center space-x-2.5">
          <Settings className="h-6 w-6 text-purple-500" />
          <span>Project Settings</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">Configure models, prompts, and workspace parameters</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {saveSuccess && (
          <div className="flex items-center space-x-2 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
            <CheckCircle className="h-4.5 w-4.5 shrink-0" />
            <span>Project configurations saved successfully!</span>
          </div>
        )}

        {error && (
          <div className="flex items-center space-x-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="glass-panel p-6 rounded-xl space-y-5">
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Custom System Prompt Override
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. You are a legal contracts advisor. Focus on clauses and dates, be concise, and output as bullet points..."
              className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 text-sm resize-none leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                Model Selection
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-purple-500 text-sm"
              >
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="ollama/llama3">Local: Llama 3 (Ollama)</option>
                <option value="ollama/phi3">Local: Phi-3 (Ollama)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                Retrieval Top-K
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value) || 6)}
                className="w-full px-4 py-2 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-850">
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center space-x-2 text-xs font-bold text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 px-4 py-2.5 rounded-lg transition-all"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Project</span>
          </button>

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex items-center bg-purple-650 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-lg shadow-lg shadow-purple-600/10 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs disabled:opacity-50 disabled:hover:scale-100"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Configurations
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
