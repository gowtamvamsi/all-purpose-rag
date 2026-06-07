"use client";

import React, { useEffect, useState } from "react";
import { Server, Activity, FileDigit, Cpu } from "lucide-react";
import { db } from "@/app/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function GridStatusPanel() {
  const [status, setStatus] = useState<any>({
    active_workers_count: 0,
    workers_data: [],
    metrics: { completed: 0, pending: 0, processing: 0, failed: 0, total: 0 }
  });

  useEffect(() => {
    // Listen to workers collection
    const unsubscribeWorkers = onSnapshot(collection(db, "workers"), (snapshot) => {
      const workers: any[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const updatedAt = data.updated_at?.toDate()?.getTime() || 0;
        // Mark worker active if pinged in the last 20 seconds
        if (now - updatedAt < 20000) {
          workers.push(data);
        }
      });
      setStatus((prev: any) => ({
        ...prev,
        active_workers_count: workers.length,
        workers_data: workers
      }));
    });

    // Listen to tasks collection
    const unsubscribeTasks = onSnapshot(collection(db, "tasks"), (snapshot) => {
      let completed = 0;
      let pending = 0;
      let processing = 0;
      let failed = 0;
      
      snapshot.forEach((docSnap) => {
        const statusVal = docSnap.data().status;
        if (statusVal === "completed") completed++;
        else if (statusVal === "pending") pending++;
        else if (statusVal === "processing") processing++;
        else if (statusVal === "failed") failed++;
      });
      
      setStatus((prev: any) => ({
        ...prev,
        metrics: {
          completed,
          pending,
          processing,
          failed,
          total: completed + pending + processing + failed
        }
      }));
    });

    return () => {
      unsubscribeWorkers();
      unsubscribeTasks();
    };
  }, []);

  const { active_workers_count: activeWorkers, metrics } = status;
  const browserWorkers = status?.workers_data?.filter((w: any) => w.worker_type === "browser")?.length || 0;
  const desktopWorkers = status?.workers_data?.filter((w: any) => w.worker_type === "desktop")?.length || 0;
  const totalVram = status?.workers_data?.reduce((acc: number, w: any) => acc + (w.vram_gb || 0), 0) || 0;

  return (
    <div className="mb-10 p-6 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-lg relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 opacity-50" />
      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center">
            <Cpu className="h-5 w-5 mr-2 text-emerald-400" />
            Global Compute Grid
          </h2>
          <p className="text-sm text-slate-400 mt-1">Distributed OCR & Embedding Extraction</p>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1">Active Workers</div>
            <div className="text-2xl font-bold text-slate-200 flex items-center justify-end">
              <span className="relative flex h-3 w-3 mr-2">
                {activeWorkers > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${activeWorkers > 0 ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
              </span>
              {activeWorkers}
            </div>
          </div>
          
          <div className="text-right border-l border-slate-800 pl-6">
            <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1">Grid Resources</div>
            <div className="flex items-center space-x-3 text-sm">
              <span className="text-slate-300"><span className="font-bold text-emerald-400">{browserWorkers}</span> Browser</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300"><span className="font-bold text-purple-400">{desktopWorkers}</span> Desktop</span>
              {totalVram > 0 && (
                <>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-300"><span className="font-bold text-amber-400">{totalVram}GB</span> VRAM</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/80">
          <div className="flex items-center space-x-2 text-slate-400 mb-2">
            <Activity className="h-4 w-4 text-purple-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">Processing</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">{metrics?.processing || 0}</div>
        </div>
        
        <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/80">
          <div className="flex items-center space-x-2 text-slate-400 mb-2">
            <Server className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">Queued</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">{metrics?.pending || 0}</div>
        </div>

        <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/80">
          <div className="flex items-center space-x-2 text-slate-400 mb-2">
            <FileDigit className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">Completed</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">{metrics?.completed || 0}</div>
        </div>

        <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/80 flex flex-col justify-center">
          <div className="text-xs font-medium text-slate-400 mb-1">Grid Efficiency</div>
          <div className="w-full bg-slate-800 rounded-full h-2 mb-1">
            <div 
              className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${metrics?.total > 0 ? (metrics.completed / metrics.total) * 100 : 0}%` }}
            />
          </div>
          <div className="text-[10px] text-right text-emerald-400 font-mono">
            {metrics?.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0}% Yield
          </div>
        </div>
      </div>
    </div>
  );
}
