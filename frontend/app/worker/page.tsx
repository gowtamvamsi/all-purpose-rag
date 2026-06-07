"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Script from "next/script";
import { Cpu, Terminal, Compass, Zap, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export default function WorkerPage() {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [onlineWorkers, setOnlineWorkers] = useState(0);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  
  const workerIdRef = useRef<string>("");
  const isActiveRef = useRef<boolean>(false);
  
  // Set worker ID on load
  useEffect(() => {
    workerIdRef.current = "grid_worker_" + Math.random().toString(36).substring(2, 9);
    addLog("Worker registered with ID: " + workerIdRef.current);
  }, []);

  // Sync ref to avoid closure issues in loops
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // 1. Worker Ping loop (every 10s)
  useEffect(() => {
    let intervalId: any;
    
    const runPing = async () => {
      if (!workerIdRef.current) return;
      try {
        const res = await fetch(`/api/v1/distributor/workers/ping?worker_id=${workerIdRef.current}`);
        const data = await res.json();
        if (res.ok) {
          setOnlineWorkers(data.active_workers_count);
        }
      } catch (err) {
        console.error("Worker ping failed", err);
      }
    };

    runPing();
    intervalId = setInterval(runPing, 10000);
    return () => clearInterval(intervalId);
  }, []);

  // 2. Main Worker Task Polling loop
  useEffect(() => {
    let isRunning = true;
    
    const loop = async () => {
      while (isRunning) {
        if (!isActiveRef.current || !pdfJsLoaded) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        
        setStatus("Listening");
        try {
          const res = await fetch(`/api/v1/distributor/tasks?worker_id=${workerIdRef.current}`);
          if (!res.ok) {
            throw new Error(`HTTP error ${res.status}`);
          }
          
          const data = await res.json();
          if (data.task) {
            const { task_id, document_id, page_number } = data.task;
            setStatus("Processing");
            addLog(`Task received: Document ${document_id.substring(0,8)}... Page ${page_number}`);
            
            try {
              // Fetch PDF file bytes
              addLog(`Downloading document bytes...`);
              const fileRes = await fetch(`/api/v1/distributor/documents/${document_id}/file`);
              if (!fileRes.ok) {
                throw new Error("Failed to download PDF file");
              }
              const arrayBuffer = await fileRes.arrayBuffer();
              
              // Load PDF in browser
              addLog(`Parsing PDF page ${page_number} locally...`);
              // @ts-ignore
              const pdfjsLib = window["pdfjs-dist/build/pdf"];
              pdfjsLib.GlobalWorkerOptions.workerSrc = "";
              pdfjsLib.GlobalWorkerOptions.disableWorker = true;
              
              const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
              const pdf = await loadingTask.promise;
              const page = await pdf.getPage(page_number);
              
              // Extract text content
              const textContent = await page.getTextContent();
              // @ts-ignore
              const textItems = textContent.items.map((item: any) => item.str);
              const extractedText = textItems.join(" ");
              
              addLog(`Extraction complete. Length: ${extractedText.length} characters.`);
              
              // Submit results back
              addLog(`Uploading results to grid controller...`);
              const submitRes = await fetch(`/api/v1/distributor/tasks/${task_id}/result`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ result_text: extractedText })
              });
              
              if (submitRes.ok) {
                setTasksCompleted((prev) => prev + 1);
                addLog(`Success! Page ${page_number} committed to database.`);
              } else {
                throw new Error("Failed to upload extraction results");
              }
            } catch (err: any) {
              addLog(`Error processing task: ${err.message || err}`);
              // Wait before retrying to avoid loops on error
              await new Promise((resolve) => setTimeout(resolve, 4000));
            }
          } else {
            // No tasks available, wait
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (err: any) {
          addLog(`Server connection error: ${err.message || err}`);
          setStatus("Connection Stalled");
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    };

    loop();
    
    return () => {
      isRunning = false;
    };
  }, [pdfJsLoaded]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white relative overflow-hidden">
      {/* Dynamic script loading for pdf.js */}
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          console.log("PDFJS Loaded");
          setPdfJsLoaded(true);
          addLog("PDF.js engine initialized successfully.");
        }}
      />
      
      {/* Background cyber grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-60 z-0"></div>

      {/* Decorative Blur Orbs */}
      <div className="absolute top-0 right-1/4 h-96 w-96 bg-purple-600/10 rounded-full blur-3xl z-0 pointer-events-none"></div>
      <div className="absolute bottom-10 left-10 h-80 w-80 bg-indigo-600/10 rounded-full blur-3xl z-0 pointer-events-none"></div>

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2.5">
          <Compass className="h-7 w-7 text-purple-500 animate-spin-slow" />
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-purple-400 bg-clip-text text-transparent">
            OmniBase Grid
          </span>
        </Link>
        <div className="flex items-center space-x-4">
          <span className="text-xs text-slate-500">Node ID: {workerIdRef.current || "Registering..."}</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-12 gap-8 z-10">
        
        {/* Control Panel (left 5 columns) */}
        <div className="md:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-900 bg-slate-950/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <Cpu className={`h-12 w-12 ${isActive ? "text-purple-500 animate-pulse" : "text-slate-700"}`} />
            </div>
            
            <h2 className="text-lg font-bold text-slate-100 flex items-center mb-1">
              Compute Node Control
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Toggle to allocate local browser CPU resources to process RAG database documents.
            </p>

            <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl mb-6">
              <div>
                <span className="block font-bold text-sm text-slate-200">CPU Contribution</span>
                <span className="text-xs text-slate-500">Click to join local cluster</span>
              </div>
              <button
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  isActive ? "bg-purple-600" : "bg-slate-800"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/50 p-4 border border-slate-900 rounded-xl">
                <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</span>
                <span className={`text-base font-bold flex items-center ${
                  status === "Processing" ? "text-purple-400" : 
                  status === "Listening" ? "text-emerald-400" : "text-slate-400"
                }`}>
                  {status === "Processing" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />}
                  {status === "Listening" && <Zap className="mr-1.5 h-4 w-4 text-emerald-400 shrink-0" />}
                  {status}
                </span>
              </div>

              <div className="bg-slate-900/50 p-4 border border-slate-900 rounded-xl">
                <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tasks Completed</span>
                <span className="text-xl font-extrabold text-slate-200 flex items-center">
                  <CheckCircle2 className="h-5 w-5 mr-1.5 text-purple-500 shrink-0" />
                  {tasksCompleted}
                </span>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
            <h3 className="font-bold text-sm text-slate-300 uppercase tracking-wider mb-4">Cluster Health</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Total Active Workers on WiFi</span>
                <span className="font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                  {onlineWorkers} Online
                </span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">PDF.js Web Engine</span>
                <span className={`font-bold ${pdfJsLoaded ? "text-emerald-400" : "text-amber-500"}`}>
                  {pdfJsLoaded ? "Loaded" : "Initializing..."}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-500/80 leading-relaxed">
              <strong>Opt-In Note:</strong> This feature uses the local device client sandbox inside your browser. No private files or security keys are stored on the worker. Closing this browser tab immediately stops computational contribution.
            </div>
          </div>
        </div>

        {/* Console logs terminal (right 7 columns) */}
        <div className="md:col-span-7 flex flex-col h-[500px] md:h-auto">
          <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-slate-900 bg-slate-950/50 overflow-hidden relative">
            
            {/* Terminal Header */}
            <div className="bg-slate-950 px-4 py-3 border-b border-slate-900 flex items-center space-x-2 shrink-0">
              <Terminal className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-mono font-bold text-slate-400">GRID_CONSOLE_OUTPUT</span>
              <div className="flex space-x-1.5 ml-auto">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800"></span>
              </div>
            </div>

            {/* Terminal Console Logs */}
            <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-2 select-text scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {logs.length === 0 ? (
                <div className="text-slate-600 italic">Waiting for connection or activation...</div>
              ) : (
                logs.map((log, index) => (
                  <div
                    key={index}
                    className={`leading-relaxed whitespace-pre-wrap break-all ${
                      log.includes("Error") ? "text-red-400" :
                      log.includes("Success") ? "text-emerald-400" :
                      log.includes("Task received") ? "text-purple-400 font-bold" : "text-slate-300"
                    }`}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
