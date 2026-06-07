"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { Loader2 } from "lucide-react";

export default function ChatHome() {
  const router = useRouter();
  const params = useParams();
  const { token, apiFetch } = useAppStore();
  const projectId = params.projectId as string;

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        // Fetch conversations
        const convs = await apiFetch(`/projects/${projectId}/conversations`);
        if (convs && convs.length > 0) {
          // Redirect to most recent conversation
          router.push(`/projects/${projectId}/chat/${convs[0].id}`);
        } else {
          // Create new conversation
          const newConv = await apiFetch(`/projects/${projectId}/conversations`, {
            method: "POST",
            body: JSON.stringify({ title: "New Conversation" }),
          });
          // Refresh layouts sidebar
          window.dispatchEvent(new Event("refresh-conversations"));
          router.push(`/projects/${projectId}/chat/${newConv.id}`);
        }
      } catch (err) {
        console.error("Failed to route chat redirect:", err);
        router.push(`/projects/${projectId}`);
      }
    };

    if (token && projectId) {
      handleRedirect();
    }
  }, [token, projectId]);

  return (
    <div className="flex h-full items-center justify-center bg-slate-950/20">
      <div className="flex flex-col items-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className="text-slate-500 text-xs font-semibold">Initializing chat session...</span>
      </div>
    </div>
  );
}
