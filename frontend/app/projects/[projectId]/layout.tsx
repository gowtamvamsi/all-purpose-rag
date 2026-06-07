"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/useAppStore";
import { 
  Folder, FileText, MessageSquare, Settings, ChevronLeft, Plus, 
  Trash2, LogOut, Menu, X, Compass, Loader2 
} from "lucide-react";

interface Conversation {
  id: string;
  project_id: string;
  title: string | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
}

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const { user, token, initAuth, apiFetch, logout, authInitialized } = useAppStore();

  const projectId = params.projectId as string;
  const activeConvId = params.convId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newChatLoading, setNewChatLoading] = useState(false);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (authInitialized && !token) {
      router.push("/login");
    }
  }, [authInitialized, token, router]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const proj = await apiFetch(`/projects/${projectId}`);
      setProject(proj);
      
      const convs = await apiFetch(`/projects/${projectId}/conversations`);
      setConversations(convs);
    } catch (err) {
      console.error("Failed to load project sidebar data:", err);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authInitialized && token && projectId) {
      loadProjectData();
    }
  }, [authInitialized, token, projectId]);

  // Expose reload method via event dispatch so sub-pages can trigger sidebar refresh
  useEffect(() => {
    const handleRefresh = () => {
      if (authInitialized && token && projectId) {
        apiFetch(`/projects/${projectId}/conversations`)
          .then(setConversations)
          .catch(console.error);
      }
    };
    window.addEventListener("refresh-conversations", handleRefresh);
    return () => window.removeEventListener("refresh-conversations", handleRefresh);
  }, [authInitialized, token, projectId]);

  const handleCreateChat = async () => {
    setNewChatLoading(true);
    try {
      const conv = await apiFetch(`/projects/${projectId}/conversations`, {
        method: "POST",
        body: JSON.stringify({ title: "New Conversation" }),
      });
      
      // Update local state
      setConversations([conv, ...conversations]);
      router.push(`/projects/${projectId}/chat/${conv.id}`);
    } catch (err) {
      console.error("Failed to start chat:", err);
      alert("Failed to start chat session");
    } finally {
      setNewChatLoading(false);
    }
  };

  const handleDeleteChat = async (convId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;

    try {
      await apiFetch(`/projects/${projectId}/conversations/${convId}`, {
        method: "DELETE",
      });
      setConversations(conversations.filter(c => c.id !== convId));
      if (activeConvId === convId) {
        router.push(`/projects/${projectId}`);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  if (!authInitialized || (loading && !project)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-10 w-10 text-purple-500 animate-spin" />
          <span className="text-slate-400 text-sm font-semibold">Loading project...</span>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-950/70 border-r border-slate-800/80 backdrop-blur-md">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-850 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors text-xs font-bold">
          <ChevronLeft className="h-4 w-4" />
          <span>Dashboard</span>
        </Link>
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">OmniBase Workspace</span>
      </div>

      <div className="p-4 border-b border-slate-800/60">
        <h2 className="text-md font-extrabold text-slate-100 flex items-center space-x-2">
          <Folder className="h-4.5 w-4.5 text-purple-500 shrink-0" />
          <span className="truncate">{project?.name}</span>
        </h2>
        {project?.description && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{project.description}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="px-3 py-4 space-y-1">
        <Link
          href={`/projects/${projectId}`}
          className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
            pathname === `/projects/${projectId}` || pathname === `/projects/${projectId}/documents`
              ? "bg-purple-600 text-white shadow-lg shadow-purple-600/10"
              : "text-slate-400 hover:text-white hover:bg-slate-900/50"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Documents</span>
        </Link>
        
        <Link
          href={`/projects/${projectId}/settings`}
          className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
            pathname === `/projects/${projectId}/settings`
              ? "bg-purple-600 text-white shadow-lg shadow-purple-600/10"
              : "text-slate-400 hover:text-white hover:bg-slate-900/50"
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </Link>
      </div>

      {/* Conversations Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between border-t border-slate-850">
        <span className="text-xs font-bold text-slate-400 tracking-wide">Conversations</span>
        <button
          onClick={handleCreateChat}
          disabled={newChatLoading}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-all"
          title="New Chat"
        >
          {newChatLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {conversations.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500 leading-normal">
            No chats started yet.<br />Click the '+' above to query.
          </div>
        ) : (
          conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/projects/${projectId}/chat/${conv.id}`}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition-all group ${
                activeConvId === conv.id
                  ? "bg-purple-950/40 text-purple-300 border border-purple-800/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
              }`}
            >
              <div className="flex items-center space-x-2.5 truncate min-w-0 pr-2">
                <MessageSquare className={`h-4 w-4 shrink-0 ${activeConvId === conv.id ? "text-purple-400" : "text-slate-500"}`} />
                <span className="truncate">{conv.title}</span>
              </div>
              <button
                onClick={(e) => handleDeleteChat(conv.id, e)}
                className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-md opacity-0 group-hover:opacity-100 transition-all shrink-0"
                title="Delete Chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Link>
          ))
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-slate-850 flex items-center justify-between text-xs text-slate-400 bg-slate-950/20">
        <div className="flex items-center space-x-2 truncate">
          <div className="h-6.5 w-6.5 rounded-full bg-purple-900/40 flex items-center justify-center text-[10px] font-bold text-purple-400 border border-purple-800/20">
            {user?.email[0].toUpperCase()}
          </div>
          <span className="truncate max-w-[100px] font-semibold">{user?.name || user?.email}</span>
        </div>
        <button 
          onClick={logout}
          className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
          title="Sign Out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex text-slate-100 overflow-hidden">
      {/* Desktop Sidebar (Always visible) */}
      <aside className="w-64 hidden md:block shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-slate-950/80 backdrop-blur-sm">
          <div className="w-64 h-full relative">
            {sidebarContent}
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-[-48px] p-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="h-14 border-b border-slate-800/60 bg-slate-950/40 flex items-center justify-between px-4 md:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="font-extrabold text-sm tracking-tight text-slate-200">
            {project?.name}
          </div>
          <Link href="/dashboard" className="p-2 text-slate-400 hover:text-white">
            <Compass className="h-5 w-5" />
          </Link>
        </header>

        {/* Viewport page render */}
        <div className="flex-1 overflow-y-auto min-w-0 relative bg-slate-950/20">
          {children}
        </div>
      </div>
    </div>
  );
}
