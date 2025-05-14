
// CamUpdatePageContent.tsx – supports multiple IPs with sequential batch updates
// -----------------------------------------------------------------------------
// Allows users to input multiple camera IPs, dynamically add/remove fields,
// check connectivity for each, select a firmware file, and then initiate
// a batch update process that updates cameras one by one.

'use client';

import React, { useState, type ChangeEvent, type FormEvent, useMemo, useEffect, useRef } from 'react';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  Network, UploadCloud, FileCog, CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw, Wifi, WifiOff, HelpCircle, Server, Info, PlusCircle, Trash2, Settings2, Power, ListChecks
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Helpers / endpoints ----------------------------------------------------------
// -----------------------------------------------------------------------------
const CAM_ORIGIN    = (ip: string) => `http://${ip}`; // Ensure this is HTTP if camera is HTTP-only
const STATUS_URL    = (ip: string) => `${CAM_ORIGIN(ip)}/update/status`; // GET: Check if camera is ready/available, Poll install status
const UPLOAD_URL    = (ip: string) => `${CAM_ORIGIN(ip)}/update`;        // POST: Upload firmware file
const START_INSTALL = (ip: string) => `${CAM_ORIGIN(ip)}/update/start`;  // POST: Tell camera to start installing. Body: { filename: string }

type CameraUpdateStatus =
  | 'idle'              // Initial state, or after being added
  | 'connecting'        // Pinging camera
  | 'connected'         // Camera reachable and ready for update steps
  | 'failed_connection' // Camera unreachable or error during initial connection
  | 'pending_update'    // Queued for update in batch
  | 'uploading'         // Firmware upload in progress
  | 'installing'        // Firmware installation in progress
  | 'update_complete'   // Firmware update successful
  | 'update_failed';    // Firmware update failed at some stage

interface CameraEntry {
  id: string;
  ip: string;
  status: CameraUpdateStatus;
  progress: number; // 0-100 for upload/install
  message: string;  // Status messages, error details
}

// Expected response from STATUS_URL when polling for install status
interface InstallStatusResp {
  status: 'started' | 'in_progress' | 'finished' | 'reboot_required' | 'error';
  message?: string;
  progress?: number; // Optional progress from camera
}

type AppStep =
  | 'configure_ips'     // User adds/removes IP fields, enters IPs
  | 'ips_checked'       // Initial connection check done, user selects firmware
  | 'batch_updating'    // Updates are in progress for the batch
  | 'batch_complete';   // All updates attempted

// -----------------------------------------------------------------------------
export default function CamUpdatePageContent() {
  const [cameraEntries, setCameraEntries] = useState<CameraEntry[]>([
    { id: crypto.randomUUID(), ip: '', status: 'idle', progress: 0, message: 'Enter IP Address' }
  ]);
  const [file, setFile] = useState<File | null>(null);
  const [appStep, setAppStep] = useState<AppStep>('configure_ips');
  const { toast } = useToast();
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);


  useEffect(() => {
    // Generate a unique ID for new entries if crypto.randomUUID is not available in older environments.
    if (typeof crypto === 'undefined' || !crypto.randomUUID) {
        (window as any).crypto = window.crypto || {};
        (window as any).crypto.randomUUID = () =>
            (''+[1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                (parseInt(c,10) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> parseInt(c,10) / 4).toString(16)
            );
    }
  }, []);


  const updateCameraEntry = (id: string, updates: Partial<CameraEntry>) => {
    setCameraEntries(prevEntries =>
      prevEntries.map(entry => entry.id === id ? { ...entry, ...updates } : entry)
    );
  };

  const handleIpChange = (id: string, newIp: string) => {
    updateCameraEntry(id, { ip: newIp, status: 'idle', message: 'IP changed. Re-check connections.' });
    if (appStep === 'ips_checked') setAppStep('configure_ips'); // Require re-check if IPs change after check
  };

  const addCameraField = () => {
    setCameraEntries(prevEntries => [
      ...prevEntries,
      { id: crypto.randomUUID(), ip: '', status: 'idle', progress: 0, message: 'Enter IP Address' }
    ]);
  };

  const removeCameraField = (id: string) => {
    setCameraEntries(prevEntries => prevEntries.filter(entry => entry.id !== id));
     if (appStep === 'ips_checked' && cameraEntries.length === 1) { // if last one removed after check
        setAppStep('configure_ips');
    }
  };

  const handleCheckAllConnections = async () => {
    if (cameraEntries.every(entry => !entry.ip.trim())) {
        toast({ variant: 'destructive', title: 'No IPs', description: 'Please enter at least one IP address.'});
        return;
    }
    toast({ title: 'Checking Connections...', description: 'Pinging all entered IP addresses.' });

    for (const entry of cameraEntries) {
      if (!entry.ip.trim() || !/^\d{1,3}(\.\d{1,3}){3}$/.test(entry.ip.trim())) {
        updateCameraEntry(entry.id, { status: 'failed_connection', message: 'Invalid IP format.' });
        continue;
      }
      updateCameraEntry(entry.id, { status: 'connecting', message: 'Pinging...' });
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout for status check

        const res = await fetch(STATUS_URL(entry.ip), { method: 'GET', mode: 'cors', signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok || res.status === 404) { // 404 might mean update endpoint exists but no active update (still connectable)
          updateCameraEntry(entry.id, { status: 'connected', message: 'Reachable and ready.' });
        } else {
          updateCameraEntry(entry.id, { status: 'failed_connection', message: `Connection error (HTTP ${res.status})` });
        }
      } catch (err: any) {
        let errorMsg = 'Network error or CORS. Check console.';
        if (err.name === 'AbortError') errorMsg = 'Connection timed out.';
        console.error(`Error connecting to ${entry.ip}:`, err);
        updateCameraEntry(entry.id, { status: 'failed_connection', message: errorMsg });
      }
    }
    setAppStep('ips_checked');
    toast({ title: 'Connection Check Complete', description: 'Review camera statuses below.'});
  };

  const handleStartAllUpdates = async () => {
    if (!file) {
      toast({ variant: 'destructive', title: 'No Firmware File', description: 'Please select a firmware file to upload.' });
      return;
    }
    const camerasToUpdate = cameraEntries.filter(entry => entry.ip.trim() && (entry.status === 'connected' || entry.status === 'idle' || entry.status === 'update_failed' || entry.status === 'update_complete'));
    if (camerasToUpdate.length === 0) {
      toast({ variant: 'destructive', title: 'No Cameras Ready', description: 'No valid IPs are connected or ready for update. Please check connections.' });
      return;
    }

    setAppStep('batch_updating');
    setIsProcessingBatch(true);
    toast({ title: 'Batch Update Started', description: `Attempting to update ${camerasToUpdate.length} camera(s).` });

    for (const entry of cameraEntries) { // Iterate all, but logic inside will skip non-updatable ones
      if (!entry.ip.trim() || !(entry.status === 'connected' || entry.status === 'idle' || entry.status === 'update_failed' || entry.status === 'update_complete')) {
        // Skip cameras that are not in a state to be updated (e.g. failed_connection, or already processing)
        // or if IP is empty
        if(entry.ip.trim() && entry.status !== 'failed_connection' && entry.status !== 'connecting' && entry.status !== 'uploading' && entry.status !== 'installing') {
             updateCameraEntry(entry.id, { status: 'pending_update', message: 'Queued for update.' });
        }
        continue;
      }

      // Pre-update check (redundant if 'Check All Connections' was mandatory, but good for robustness)
      updateCameraEntry(entry.id, { status: 'connecting', message: 'Verifying connection...' });
      try {
        const preCheckRes = await fetch(STATUS_URL(entry.ip), { method: 'GET', mode: 'cors' });
        if (!preCheckRes.ok && preCheckRes.status !== 404) {
          updateCameraEntry(entry.id, { status: 'update_failed', message: `Pre-update check failed (HTTP ${preCheckRes.status})` });
          continue;
        }
      } catch (err) {
        updateCameraEntry(entry.id, { status: 'update_failed', message: 'Pre-update connection failed.' });
        continue;
      }

      // 1. Upload Firmware
      updateCameraEntry(entry.id, { status: 'uploading', progress: 0, message: 'Uploading firmware...' });
      const uploadSuccess = await uploadFirmware(entry.id, entry.ip, file);
      if (!uploadSuccess) continue; // uploadFirmware handles status update on failure

      // 2. Start Installation
      updateCameraEntry(entry.id, { status: 'installing', progress: 0, message: 'Starting installation...' });
      const installStarted = await startCameraInstall(entry.id, entry.ip, file.name);
      if (!installStarted) continue; // startCameraInstall handles status update on failure

      // 3. Poll Installation Status
      await pollInstallStatus(entry.id, entry.ip);
    }

    setAppStep('batch_complete');
    setIsProcessingBatch(false);
    toast({ title: 'Batch Update Process Finished', description: 'Check individual camera statuses.' });
  };

  const uploadFirmware = async (entryId: string, ip: string, firmwareFile: File): Promise<boolean> => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_URL(ip)); // Ensure UPLOAD_URL is correct

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentage = Math.round((event.loaded / event.total) * 100);
        updateCameraEntry(entryId, { progress: percentage, message: `Uploading: ${percentage}%` });
      }
    };
    
    return new Promise((resolve) => {
        xhr.onload = () => {
            if (xhr.status === 200) {
                updateCameraEntry(entryId, { progress: 100, message: 'Upload complete. Preparing to install.' });
                resolve(true);
            } else {
                updateCameraEntry(entryId, { status: 'update_failed', progress: 0, message: `Upload failed (HTTP ${xhr.status}: ${xhr.responseText || 'Server error'})` });
                resolve(false);
            }
        };
        xhr.onerror = () => {
            updateCameraEntry(entryId, { status: 'update_failed', progress: 0, message: 'Network error during upload. Check CORS and camera connectivity.' });
            console.error("XHR onerror:", xhr.status, xhr.responseText);
            resolve(false);
        };
        xhr.onabort = () => {
            updateCameraEntry(entryId, { status: 'update_failed', progress: 0, message: 'Upload aborted.'});
            resolve(false);
        }
        xhr.ontimeout = () => {
             updateCameraEntry(entryId, { status: 'update_failed', progress: 0, message: 'Upload timed out.'});
            resolve(false);
        }

        const formData = new FormData();
        formData.append('file', firmwareFile); // Key 'file' must match server expectation
        xhr.send(formData);
    });
  };

  const startCameraInstall = async (entryId: string, ip: string, filename: string): Promise<boolean> => {
    try {
      const response = await fetch(START_INSTALL(ip), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }), // Server expects filename
      });
      if (response.ok) {
        updateCameraEntry(entryId, { message: 'Installation process initiated.' });
        return true;
      } else {
        const errorText = await response.text();
        updateCameraEntry(entryId, { status: 'update_failed', message: `Failed to start install (HTTP ${response.status}): ${errorText}` });
        return false;
      }
    } catch (err) {
      console.error(`Error starting install for ${ip}:`, err);
      updateCameraEntry(entryId, { status: 'update_failed', message: 'Network error starting install. Check CORS.' });
      return false;
    }
  };

  const pollInstallStatus = async (entryId: string, ip: string) => {
    return new Promise<void>((resolve) => {
      const intervalId = setInterval(async () => {
        const currentEntries = cameraEntriesRef.current; 
        const currentEntry = currentEntries.find(e => e.id === entryId);
        if (!currentEntry || (currentEntry.status !== 'installing' && currentEntry.status !== 'update_complete' && currentEntry.status !== 'reboot_required')) {
            if (currentEntry && currentEntry.status === 'update_failed') {
                 updateCameraEntry(entryId, { message: currentEntry.message || 'Installation failed or stopped.' });
            }
            clearInterval(intervalId);
            resolve();
            return;
        }

        try {
          const res = await fetch(STATUS_URL(ip));
          if (!res.ok) {
            updateCameraEntry(entryId, { message: `Polling... (HTTP ${res.status})` });
            return; 
          }
          const data = await res.json() as InstallStatusResp;

          updateCameraEntry(entryId, {
            progress: data.progress !== undefined ? data.progress : currentEntry?.progress || 50, 
            message: data.message || `Status: ${data.status}`,
          });

          if (data.status === 'finished' || data.status === 'reboot_required') {
            updateCameraEntry(entryId, { status: 'update_complete', progress: 100, message: data.message || 'Installation successful. Camera may reboot.' });
            clearInterval(intervalId);
            resolve();
          } else if (data.status === 'error') {
            updateCameraEntry(entryId, { status: 'update_failed', message: data.message || 'Installation reported an error.' });
            clearInterval(intervalId);
            resolve();
          }
        } catch (err) {
          updateCameraEntry(entryId, { message: 'Polling... (Network issue)' });
          console.error(`Error polling ${ip}:`, err);
        }
      }, 5000); 
    });
  };
  
  const cameraEntriesRef = React.useRef(cameraEntries);
  useEffect(() => {
    cameraEntriesRef.current = cameraEntries;
  }, [cameraEntries]);


  const resetBatch = (clearIps: boolean = false) => {
    if (clearIps) {
      setCameraEntries([{ id: crypto.randomUUID(), ip: '', status: 'idle', progress: 0, message: 'Enter IP Address' }]);
    } else {
      setCameraEntries(prevEntries => prevEntries.map(entry => ({
        ...entry,
        status: 'idle',
        progress: 0,
        message: 'Ready for new operation.'
      })));
    }
    setFile(null);
    setAppStep('configure_ips');
    setIsProcessingBatch(false);
    toast({ title: 'Reset', description: clearIps ? 'Cleared all IPs and firmware.' : 'Statuses reset, ready for new operation.'});
  };


  const getStatusIcon = (status: CameraUpdateStatus) => {
    switch (status) {
      case 'idle': return <HelpCircle className="text-muted-foreground" />;
      case 'connecting': return <Loader2 className="animate-spin text-blue-500" />;
      case 'connected': return <Wifi className="text-green-500" />;
      case 'failed_connection': return <WifiOff className="text-red-500" />;
      case 'pending_update': return <ListChecks className="text-gray-500" />;
      case 'uploading': return <UploadCloud className="animate-pulse text-blue-500" />;
      case 'installing': return <Settings2 className="animate-spin text-orange-500" />;
      case 'update_complete': return <CheckCircle2 className="text-green-500" />;
      case 'update_failed': return <XCircle className="text-red-500" />;
      default: return <HelpCircle className="text-muted-foreground" />;
    }
  };
  
  const canStartBatchUpdate = useMemo(() => {
    if (!file) return false;
    return cameraEntries.some(entry => entry.ip.trim() && (entry.status === 'connected' || entry.status === 'idle' || entry.status === 'update_failed' || entry.status === 'update_complete'));
  }, [file, cameraEntries]);

  const renderFooter = () => {
    if (appStep === 'configure_ips') {
      return (
        <Button onClick={handleCheckAllConnections} disabled={cameraEntries.every(e => !e.ip.trim()) || isProcessingBatch} className="w-full">
          <Network className="mr-2" /> Check All Connections
        </Button>
      );
    }
    if (appStep === 'ips_checked') {
      return (
        <div className="w-full space-y-2">
             <Button onClick={handleStartAllUpdates} disabled={!canStartBatchUpdate || isProcessingBatch} className="w-full">
                <Power className="mr-2" /> Start All Updates
            </Button>
            <Button variant="outline" onClick={() => setAppStep('configure_ips')} className="w-full">
                Back to IP Configuration
            </Button>
        </div>
      );
    }
    if (appStep === 'batch_updating') {
      return <Button disabled className="w-full"><Loader2 className="mr-2 animate-spin" /> Batch Update in Progress...</Button>;
    }
    if (appStep === 'batch_complete') {
      return (
        <div className="w-full space-y-2">
          <Button onClick={() => handleStartAllUpdates()} disabled={!file || isProcessingBatch} className="w-full">
            <RefreshCw className="mr-2" /> Update Same Cameras Again
          </Button>
          <Button variant="outline" onClick={() => resetBatch(true)} className="w-full">
            <Trash2 className="mr-2" /> Start New Batch (Clear IPs)
          </Button>
           <Button variant="ghost" onClick={() => resetBatch(false)} className="w-full text-sm">
            Reset Statuses Only
          </Button>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full max-w-3xl shadow-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server /> Camera Batch Firmware Updater
        </CardTitle>
        {appStep === 'configure_ips' && <CardDescription>Add camera IP addresses below. Use the "+" button to add more fields. Then, check connections.</CardDescription>}
        {appStep === 'ips_checked' && <CardDescription>Connections checked. Select a firmware file and start the batch update.</CardDescription>}
        {appStep === 'batch_updating' && <CardDescription>Batch update in progress. Do not close this page. Statuses will update live.</CardDescription>}
        {appStep === 'batch_complete' && <CardDescription>Batch update process finished. Review the status for each camera.</CardDescription>}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Camera IP Entries */}
        <div className="space-y-3 max-h-[400px] overflow-y-auto p-1">
          {cameraEntries.map((entry, index) => (
            <div key={entry.id} className="flex items-center gap-2 p-2 border rounded-md shadow-sm bg-card hover:shadow-md transition-shadow">
              <Label htmlFor={`ip-${entry.id}`} className="sr-only">IP Address {index + 1}</Label>
              <span className="text-sm font-medium text-muted-foreground w-8 text-right">#{index + 1}</span>
              <Input
                id={`ip-${entry.id}`}
                type="text"
                value={entry.ip}
                onChange={(e) => handleIpChange(entry.id, e.target.value)}
                placeholder="e.g., 192.168.1.100"
                className="flex-grow"
                disabled={appStep === 'batch_updating'}
              />
              <div className="w-6 h-6 flex items-center justify-center" title={entry.message || entry.status}>
                {getStatusIcon(entry.status)}
              </div>
              {cameraEntries.length > 1 && (
                 <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCameraField(entry.id)}
                    disabled={appStep === 'batch_updating'}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove this IP field"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {(entry.status === 'uploading' || entry.status === 'installing') && entry.progress > 0 && (
                <Progress value={entry.progress} className="w-20 h-2" />
              )}
            </div>
          ))}
        </div>

        <Button variant="outline" onClick={addCameraField} disabled={appStep === 'batch_updating'} className="w-full sm:w-auto">
          <PlusCircle className="mr-2" /> Add Camera IP
        </Button>

        {/* Firmware File Input - Shown after IPs are configured or checked */}
        {(appStep === 'ips_checked' || appStep === 'batch_complete' || (appStep === 'configure_ips' && cameraEntries.some(e=>e.ip.trim()))) && (
          <div className="space-y-2 pt-4 border-t mt-4">
            <Label htmlFor="firmwareFile" className="text-base font-semibold">Firmware File</Label>
            <Input
              id="firmwareFile"
              type="file"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
              disabled={appStep === 'batch_updating'}
              accept=".bin,.img,.swu,.fw,application/octet-stream" // Common firmware extensions
            />
            {file && <p className="text-sm text-muted-foreground">Selected: {file.name} ({Math.round(file.size / 1024)} KB)</p>}
             {!file && appStep === 'ips_checked' && <p className="text-sm text-destructive">Please select a firmware file to proceed.</p>}
          </div>
        )}

        {/* Individual Camera Status Details during/after update */}
        {(appStep === 'batch_updating' || appStep === 'batch_complete') && (
          <div className="space-y-2 pt-4 border-t mt-4">
            <h3 className="text-lg font-semibold">Update Log & Status</h3>
            {cameraEntries.filter(c => c.ip.trim()).map(entry => (
              <Alert key={entry.id} variant={entry.status === 'update_failed' || entry.status === 'failed_connection' ? 'destructive' : (entry.status === 'update_complete' ? 'default' : 'default')}
                     className={entry.status === 'update_complete' ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : (entry.status === 'uploading' || entry.status === 'installing' ? 'bg-blue-50 dark:bg-blue-900/30' : '')}>
                <div className="flex items-center gap-2">
                    {getStatusIcon(entry.status)}
                    <AlertTitle className="font-semibold">{entry.ip}</AlertTitle>
                </div>
                <AlertDescription className="pl-8">
                    {entry.message}
                    {(entry.status === 'uploading' || entry.status === 'installing') && entry.progress > 0 && (
                       <Progress value={entry.progress} className="mt-1 h-2" />
                    )}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter>
        {renderFooter()}
      </CardFooter>
    </Card>
  );
}

    