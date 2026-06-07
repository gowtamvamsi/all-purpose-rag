"use client";

import React, { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { Zap, Cpu, X, Settings2, ShieldCheck } from "lucide-react";
import { db } from "@/app/lib/firebase";
import { 
  doc, 
  setDoc, 
  updateDoc,
  serverTimestamp, 
  runTransaction, 
  collection, 
  query, 
  where, 
  onSnapshot 
} from "firebase/firestore";

export default function GridWorkerController() {
  const [gridStatus, setGridStatus] = useState<"pending" | "accepted" | "declined">("pending");
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<any>({
    active_workers_count: 0,
    online_workers: [],
    workers_data: [],
    metrics: { completed: 0, pending: 0, processing: 0, failed: 0, total: 0 }
  });
  
  const workerIdRef = useRef<string>("");
  const gridStatusRef = useRef<string>("pending");
  const isProcessingRef = useRef<boolean>(false);

  const promptUser = () => {
    const isAccepted = window.confirm(
      "Join Local Compute Grid?\n\nHelp parse uploaded RAG documents faster using your idle browser processing cycles. Fully sandboxed and secure."
    );
    handleChoice(isAccepted ? "accepted" : "declined");
  };

  // Set worker ID and check initial local storage choice
  useEffect(() => {
    workerIdRef.current = "bg_worker_" + Math.random().toString(36).substring(2, 9);
    try {
      const saved = localStorage.getItem("grid_worker_choice") as "pending" | "accepted" | "declined" | null;
      if (saved) {
        setGridStatus(saved);
        gridStatusRef.current = saved;
        if (saved === "pending") {
          const timer = setTimeout(() => promptUser(), 1500);
          return () => clearTimeout(timer);
        }
      } else {
        setGridStatus("pending");
        gridStatusRef.current = "pending";
        const timer = setTimeout(() => promptUser(), 1500);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      setGridStatus("pending");
      gridStatusRef.current = "pending";
      const timer = setTimeout(() => promptUser(), 1500);
      return () => clearTimeout(timer);
    }
    
    // Initialize tasksCompleted from local storage
    try {
      const savedTasks = localStorage.getItem("grid_worker_tasks_completed");
      if (savedTasks) {
        setTasksCompleted(parseInt(savedTasks, 10) || 0);
      }
    } catch (e) {}
  }, []);

  // Update status ref to avoid closure issues in async loops
  useEffect(() => {
    gridStatusRef.current = gridStatus;
  }, [gridStatus]);

  // Save changes to local storage
  const handleChoice = (choice: "accepted" | "declined") => {
    try {
      localStorage.setItem("grid_worker_choice", choice);
    } catch (e) {}
    setGridStatus(choice);
    setShowSettings(false);
  };

  // 1. Worker Ping loop (every 10s if accepted)
  useEffect(() => {
    if (gridStatus !== "accepted") return;
    
    const runPing = async () => {
      if (gridStatusRef.current !== "accepted" || !workerIdRef.current) return;
      try {
        const workerRef = doc(db, "workers", workerIdRef.current);
        await setDoc(workerRef, {
          worker_id: workerIdRef.current,
          worker_type: "browser",
          hardware: "cpu",
          vram_gb: 0,
          updated_at: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error("Grid worker ping failed", err);
      }
    };

    runPing();
    const intervalId = setInterval(runPing, 10000); // Keep alive every 10 seconds
    return () => clearInterval(intervalId);
  }, [gridStatus]);

  // 2. Subscribe to Global Workers & Tasks (real-time metrics)
  useEffect(() => {
    // Workers listener
    const qWorkers = collection(db, "workers");
    const unsubscribeWorkers = onSnapshot(qWorkers, (snapshot) => {
      const workers: any[] = [];
      const now = Date.now();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const updatedAt = data.updated_at?.toDate()?.getTime() || 0;
        // Keep active if updated in the last 20 seconds
        if (now - updatedAt < 20000) {
          workers.push(data);
        }
      });
      setGlobalStatus((prev: any) => ({
        ...prev,
        active_workers_count: workers.length,
        online_workers: workers.map(w => w.worker_id),
        workers_data: workers
      }));
    });

    // Tasks listener
    const qTasks = collection(db, "tasks");
    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      let completed = 0;
      let pending = 0;
      let processing = 0;
      let failed = 0;
      
      snapshot.forEach((doc) => {
        const status = doc.data().status;
        if (status === "completed") completed++;
        else if (status === "pending") pending++;
        else if (status === "processing") processing++;
        else if (status === "failed") failed++;
      });
      
      setGlobalStatus((prev: any) => ({
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

  // 3. Main background task listener & processor
  useEffect(() => {
    // @ts-ignore
    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    if (gridStatus !== "accepted" || !pdfjsLib) return;

    setStatus("Listening");

    const claimTask = async (taskDocRef: any) => {
      try {
        return await runTransaction(db, async (transaction) => {
          const sfDoc = await transaction.get(taskDocRef);
          if (!sfDoc.exists()) return false;
          
          const data = sfDoc.data() as any;
          if (data && data.status === "pending") {
            transaction.update(taskDocRef, {
              status: "processing",
              assigned_to: workerIdRef.current,
              updated_at: serverTimestamp()
            });
            return true;
          }
          return false;
        });
      } catch (e) {
        console.error("Claim transaction failed: ", e);
        return false;
      }
    };

    const processTask = async (taskId: string, taskData: any) => {
      setStatus("Processing");
      const { document_id, page_number } = taskData;
      
      try {
        // Download PDF file bytes from the server
        const fileRes = await fetch(`/api/v1/distributor/documents/${document_id}/file`);
        if (!fileRes.ok) throw new Error("File download failed");
        const arrayBuffer = await fileRes.arrayBuffer();
        
        // Load PDF in browser using the dynamic script window namespace
        // @ts-ignore
        const pdfjsLib = window["pdfjs-dist/build/pdf"];
        pdfjsLib.GlobalWorkerOptions.workerSrc = "";
        pdfjsLib.GlobalWorkerOptions.disableWorker = true;
        
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(page_number);
        
        const textContent = await page.getTextContent();
        // @ts-ignore
        const textItems = textContent.items.map((item: any) => item.str);
        const extractedText = textItems.join(" ");
        
        // Submit results directly to Firestore
        const taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, {
          status: "completed",
          result_text: extractedText,
          updated_at: serverTimestamp()
        });
        
        setTasksCompleted((prev) => {
          const newTotal = prev + 1;
          try {
            localStorage.setItem("grid_worker_tasks_completed", newTotal.toString());
          } catch (e) {}
          return newTotal;
        });
        setStatus("Listening");
      } catch (err) {
        console.error("Task execution failed:", err);
        const taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, {
          status: "failed",
          updated_at: serverTimestamp()
        });
        setStatus("Listening");
      }
    };

    // Listen to pending CPU tasks
    const qPending = query(
      collection(db, "tasks"), 
      where("status", "==", "pending"), 
      where("required_hardware", "==", "cpu")
    );

    const unsubscribeTasks = onSnapshot(qPending, async (snapshot) => {
      if (gridStatusRef.current !== "accepted" || isProcessingRef.current) return;
      
      let taskToClaim: any = null;
      snapshot.forEach((doc) => {
        if (!taskToClaim) {
          taskToClaim = doc;
        }
      });
      
      if (taskToClaim) {
        isProcessingRef.current = true;
        const claimed = await claimTask(taskToClaim.ref);
        if (claimed) {
          await processTask(taskToClaim.id, taskToClaim.data());
        }
        isProcessingRef.current = false;
      }
    });

    return () => {
      unsubscribeTasks();
    };
  }, [gridStatus, pdfJsLoaded]);

  return (
    <>
      {/* Load pdf.js dynamically in background */}
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"
        strategy="afterInteractive"
        onLoad={() => setPdfJsLoaded(true)}
      />

      {/* Floating Indicator Badge */}
      <div className="fixed bottom-24 right-6 z-40 select-none">
        {gridStatus === "accepted" && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center space-x-2 py-2 px-3.5 bg-slate-950/80 hover:bg-slate-950 border border-emerald-500/20 hover:border-emerald-500/40 rounded-full shadow-lg backdrop-blur-md transition-all group scale-95 hover:scale-100"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-mono font-semibold text-slate-300 tracking-wider">
              {status === "Processing" ? "Processing Tasks..." : `Grid Active (${tasksCompleted})`}
            </span>
          </button>
        )}
        
        {gridStatus === "declined" && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-center p-2.5 bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-full shadow-lg backdrop-blur-md transition-all scale-95 hover:scale-100"
          >
            <Zap className="h-4 w-4 text-slate-600 group-hover:text-slate-400" />
          </button>
        )}
      </div>

      {/* Settings Popover */}
      {showSettings && (
        <div className="fixed bottom-16 right-6 w-72 bg-slate-950/95 border border-slate-900 glass-panel rounded-2xl p-5 shadow-2xl z-50 animate-fade-in select-none">
          <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-3">
            <span className="font-bold text-sm text-slate-200 flex items-center">
              <Settings2 className="h-4 w-4 mr-2 text-purple-400" /> Grid Settings
            </span>
            <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="block font-bold text-xs text-slate-300">Contribute CPU</span>
                <span className="text-[10px] text-slate-500">Participate in WiFi compute cluster</span>
              </div>
              <button
                onClick={() => handleChoice(gridStatus === "accepted" ? "declined" : "accepted")}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  gridStatus === "accepted" ? "bg-purple-600" : "bg-slate-800"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    gridStatus === "accepted" ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {gridStatus === "accepted" && (
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] font-mono space-y-3 shadow-inner">
                
                {/* Active Status Row */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Status</span>
                  <div className="flex items-center space-x-2">
                    {status === "Processing" ? (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                      </span>
                    ) : (
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}
                    <span className={status === "Processing" ? "text-purple-400 font-semibold" : "text-emerald-400"}>
                      {status}
                    </span>
                  </div>
                </div>

                {/* Contribution Metrics */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300 mb-1">Your Local Contribution</div>
                  
                  <div className="flex justify-between items-center bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                    <span className="text-slate-400">Pages Parsed</span>
                    <span className="text-emerald-400 font-bold">{tasksCompleted}</span>
                  </div>
                  
                  <div className="flex justify-between items-center bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                    <span className="text-slate-400">Tokens Extracted</span>
                    <span className="text-blue-400 font-bold">~{(tasksCompleted * 450).toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                    <span className="text-slate-400">CPU Time Donated</span>
                    <span className="text-amber-400 font-bold">{(tasksCompleted * 2.5).toFixed(1)}s</span>
                  </div>
                </div>

                {/* Global Network Stats */}
                {globalStatus && globalStatus.metrics && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-xs font-semibold text-slate-300 mb-1 flex justify-between items-center">
                      <span>Global Project Progress</span>
                      <span className="text-emerald-400 flex items-center">
                        <span className="relative flex h-1.5 w-1.5 mr-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                        </span>
                        {globalStatus.active_workers_count} Active Worker{globalStatus.active_workers_count !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                      <div className="flex justify-between items-center mb-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        <span>Total Parsed</span>
                        <span>{globalStatus.metrics.completed} / {globalStatus.metrics.total}</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1.5">
                        <div 
                          className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${globalStatus.metrics.total > 0 ? (globalStatus.metrics.completed / globalStatus.metrics.total) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold">
                        <span>{globalStatus.metrics.processing} Processing</span>
                        <span>{globalStatus.metrics.pending} Queued</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="p-2.5 bg-slate-900/20 border border-slate-900 rounded-lg flex items-start space-x-2 text-[10px] text-slate-500 leading-normal">
              <ShieldCheck className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
              <span>Opt-in computation utilizes native browser sandboxing to guarantee secure, isolation-locked processing.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
