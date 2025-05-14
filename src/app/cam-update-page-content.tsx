// CamUpdatePageContent.tsx – supports multiple IPs
// -----------------------------------------------------------------------------
// Allows users to input multiple camera IPs, checks connectivity for each,
// and then lets the user select one camera for the firmware update process.

'use client';

import { useState, type ChangeEvent, type FormEvent, useMemo } from 'react';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  Network, UploadCloud, FileCog, CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw, Wifi, WifiOff, HelpCircle, Server, Info,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Helpers / endpoints ----------------------------------------------------------
// -----------------------------------------------------------------------------
const CAM_ORIGIN    = (ip: string) => `http://${ip}`;
const STATUS_URL    = (ip: string) => `${CAM_ORIGIN(ip)}/update/status`; // Check if camera is ready/available for update
const UPLOAD_URL    = (ip: string) => `${CAM_ORIGIN(ip)}/update`;
const START_INSTALL = (ip: string) => `${CAM_ORIGIN(ip)}/update/start`;

type Step =
  | 'enter_ips'
  | 'connecting_to_ips'
  | 'select_camera_for_update'
  | 'ready_to_upload_firmware'
  | 'uploading_firmware'
  | 'installing_firmware'
  | 'firmware_update_complete'
  | 'firmware_update_failed';

interface StatusResp { status: 'started' | 'finished' | 'reboot_required' | 'error' }
type CameraConnectionStatus = 'connecting' | 'connected' | 'failed' | 'unreachable';
interface CameraStatusInfo {
  status: CameraConnectionStatus;
  message?: string;
}

// -----------------------------------------------------------------------------
export default function CamUpdatePageContent() {
  const [ipInput,    setIpInput]    = useState('');
  const [cameraStatuses, setCameraStatuses] = useState<Record<string, CameraStatusInfo>>({});
  const [selectedCameraIp, setSelectedCameraIp] = useState<string | null>(null);
  const [step,         setStep]         = useState<Step>('enter_ips');
  const [file,         setFile]         = useState<File | null>(null);
  const [progress,     setProgress]     = useState(0);
  const [installStatusMsg, setInstallStatusMsg] = useState('');
  const { toast } = useToast();

  // ---------------------------------------------------------------------------
  const resetAll = () => {
    setIpInput('');
    setCameraStatuses({});
    setSelectedCameraIp(null);
    setStep('enter_ips');
    setFile(null);
    setProgress(0);
    setInstallStatusMsg('');
  };

  const resetForNewUpdate = () => {
    setSelectedCameraIp(null); // Keep IPs and statuses, allow selecting another camera or re-connecting
    setStep('select_camera_for_update');
    setFile(null);
    setProgress(0);
    setInstallStatusMsg('');
  }

  // ---------------------------------------------------------------------------
  // 1️⃣ Connect to Multiple Cameras ---------------------------------------------
  // ---------------------------------------------------------------------------
  const handleConnectToCameras = async (e: FormEvent) => {
    e.preventDefault();
    const uniqueIps = Array.from(new Set(ipInput.split('\n')
      .map(ip => ip.trim())
      .filter(ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip))));

    if (uniqueIps.length === 0) {
      toast({ variant: 'destructive', title: 'No valid IPs', description: 'Please enter at least one valid IPv4 address.' });
      return;
    }

    setStep('connecting_to_ips');
    toast({ title: 'Connecting...', description: `Attempting to reach ${uniqueIps.length} camera(s).` });

    const initialStatuses: Record<string, CameraStatusInfo> = {};
    uniqueIps.forEach(ip => {
      initialStatuses[ip] = { status: 'connecting', message: 'Pinging...' };
    });
    setCameraStatuses(initialStatuses);

    const connectionPromises = uniqueIps.map(async (ip) => {
      try {
        // Using a short timeout for status check to avoid long waits for unreachable IPs
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout
        
        const res = await fetch(STATUS_URL(ip), { method: 'GET', mode: 'cors', signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok || res.status === 404) { // 404 might mean update endpoint exists but no active update
          return { ip, newStatus: { status: 'connected', message: 'Reachable' } as CameraStatusInfo };
        } else {
          return { ip, newStatus: { status: 'failed', message: `HTTP ${res.status}` } as CameraStatusInfo };
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return { ip, newStatus: { status: 'unreachable', message: 'Connection timed out' } as CameraStatusInfo };
        }
        return { ip, newStatus: { status: 'unreachable', message: 'Network error or CORS issue. Check console.' } as CameraStatusInfo };
      }
    });

    const results = await Promise.allSettled(connectionPromises);
    
    setCameraStatuses(prevStatuses => {
      const newStatuses = { ...prevStatuses };
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          newStatuses[result.value.ip] = result.value.newStatus;
        } else if (result.status === 'rejected') {
          // This case should ideally be handled by the catch block in the promise
          // but as a fallback, mark as failed if an IP was missed.
          // This part of logic might need refinement if specific IPs are not in `uniqueIps`
        }
      });
      return newStatuses;
    });

    setStep('select_camera_for_update');
  };

  // ---------------------------------------------------------------------------
  // 2️⃣ Select Camera for Update (UI handled in render) -------------------------
  // ---------------------------------------------------------------------------
  const handleSelectCamera = (ip: string) => {
    setSelectedCameraIp(ip);
    setStep('ready_to_upload_firmware');
    setFile(null); // Reset file when a new camera is selected
    setProgress(0);
    setInstallStatusMsg('');
    toast({ title: 'Camera Selected', description: `Ready to update ${ip}.`});
  };

  // ---------------------------------------------------------------------------
  // 3️⃣ Upload firmware (XHR for progress) --------------------------------------
  // ---------------------------------------------------------------------------
  const startUpload = () => {
    if (!file || !selectedCameraIp) return;

    setStep('uploading_firmware');
    toast({ title: 'Uploading', description: `${file.name} → ${selectedCameraIp}` });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_URL(selectedCameraIp));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round(100 * e.loaded / e.total));
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        setProgress(100);
        toast({ title: 'Upload complete', description: 'Starting installation…' });
        await startInstall();
      } else {
        failUpdate(`Upload failed (HTTP ${xhr.status})`);
      }
    };

    xhr.onerror = () => failUpdate('Network error during upload');

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  };

  // ---------------------------------------------------------------------------
  // 4️⃣ Start install + poll status -------------------------------------------
  // ---------------------------------------------------------------------------
  const startInstall = async () => {
    if (!selectedCameraIp || !file) return;
    setStep('installing_firmware');
    try {
      await fetch(START_INSTALL(selectedCameraIp), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });

      const poll = setInterval(async () => {
        if (!selectedCameraIp) { // Ensure selectedCameraIp is still valid if user resets during poll
            clearInterval(poll);
            return;
        }
        try {
          const res   = await fetch(STATUS_URL(selectedCameraIp));
          const data: StatusResp = await res.json();
          setInstallStatusMsg(data.status);
          if (data.status === 'finished' || data.status === 'reboot_required') {
            clearInterval(poll);
            setStep('firmware_update_complete');
          } else if (data.status === 'error') {
            clearInterval(poll);
            setStep('firmware_update_failed');
          }
        } catch { /* swallow, will retry or fail eventually */ }
      }, 3000);

    } catch (err) {
      failUpdate(`Install failed: ${err}`);
    }
  };

  const failUpdate = (msg: string) => {
    toast({ variant: 'destructive', title: 'Error', description: msg });
    setStep('firmware_update_failed');
  };

  const successfullyConnectedIPs = useMemo(() => {
    return Object.entries(cameraStatuses)
      .filter(([_, info]) => info.status === 'connected')
      .map(([ip, _]) => ip);
  }, [cameraStatuses]);
  
  // ---------------------------------------------------------------------------
  // JSX helpers --------------------------------------------------------------
  // ---------------------------------------------------------------------------
  const renderFooter = () => {
    switch (step) {
      case 'enter_ips':
        return (
          <Button type="submit" form="ipForm" disabled={!ipInput.trim()} className="w-full">
            Connect to Cameras <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        );
      case 'connecting_to_ips':
        return <Button disabled className="w-full"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</Button>;
      case 'select_camera_for_update':
         return (
            <Button variant="outline" className="w-full" onClick={resetAll}>
                Start Over With New IPs <RefreshCw className="ml-2 h-4 w-4" />
            </Button>
        );
      case 'ready_to_upload_firmware':
        return (
          <Button disabled={!file} className="w-full" onClick={startUpload}>
            Upload & Install Firmware <UploadCloud className="ml-2 h-4 w-4" />
          </Button>
        );
      case 'uploading_firmware':
      case 'installing_firmware':
        return <Button disabled className="w-full"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Please wait…</Button>;
      case 'firmware_update_complete':
        return <Button className="w-full" onClick={successfullyConnectedIPs.length > 1 ? resetForNewUpdate : resetAll}><RefreshCw className="mr-2 h-4 w-4" /> {successfullyConnectedIPs.length > 1 ? 'Update Another Camera' : 'Start New Update'}</Button>;
      case 'firmware_update_failed':
        return <Button variant="destructive" className="w-full" onClick={resetForNewUpdate}>Try Again or Select Different Camera</Button>;
      default:
        return <Button variant="outline" className="w-full" onClick={resetAll}>Reset</Button>;
    }
  };

  const getStatusIcon = (status?: CameraConnectionStatus) => {
    if (!status) return <HelpCircle className="text-muted-foreground" />;
    switch (status) {
      case 'connecting': return <Loader2 className="animate-spin text-blue-500" />;
      case 'connected': return <Wifi className="text-green-500" />;
      case 'failed': return <XCircle className="text-red-500" />;
      case 'unreachable': return <WifiOff className="text-orange-500" />;
      default: return <HelpCircle className="text-muted-foreground" />;
    }
  };

  // ---------------------------------------------------------------------------
  // Render --------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  return (
    <Card className="w-full max-w-2xl shadow-2xl">
      {step === 'enter_ips' && (
        <form onSubmit={handleConnectToCameras} id="ipForm" className="space-y-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Network /> Enter Camera IP Addresses</CardTitle>
            <CardDescription>Enter one IP address per line. Example: <br />192.168.0.101<br />192.168.0.102</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor="ipInput">IP Addresses</Label>
            <Textarea
              id="ipInput"
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
              placeholder="192.168.1.10\n192.168.1.11"
              rows={5}
              className="min-h-[100px]"
            />
          </CardContent>
          <CardFooter>{renderFooter()}</CardFooter>
        </form>
      )}

      {step === 'connecting_to_ips' && (
        <CardContent className="flex flex-col items-center p-8 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p>Connecting to cameras...</p>
          <p className="text-sm text-muted-foreground">Checking reachability and status.</p>
        </CardContent>
      )}

      {step === 'select_camera_for_update' && (
        <>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server /> Select Camera for Update</CardTitle>
            <CardDescription>
              {successfullyConnectedIPs.length > 0 
                ? `Found ${successfullyConnectedIPs.length} connectable camera(s). Select one to proceed.`
                : "No cameras connected successfully. Check IPs, network, and camera status."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(cameraStatuses).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto p-1">
                {Object.entries(cameraStatuses).map(([ip, info]) => (
                  <Card key={ip} className="shadow-md">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-lg">
                        {ip} {getStatusIcon(info.status)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground h-10">{info.message || capitalizeFirstLetter(info.status)}</p>
                    </CardContent>
                    {info.status === 'connected' && (
                      <CardFooter>
                        <Button className="w-full" onClick={() => handleSelectCamera(ip)}>
                          Select for Update <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </CardFooter>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
               <Alert variant="destructive">
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Cameras Processed</AlertTitle>
                  <AlertDescription>
                    Please go back and enter IP addresses.
                  </AlertDescription>
                </Alert>
            )}
          </CardContent>
          <CardFooter>{renderFooter()}</CardFooter>
        </>
      )}
      
      {(step === 'ready_to_upload_firmware' || step === 'uploading_firmware' || step === 'installing_firmware' || step === 'firmware_update_complete' || step === 'firmware_update_failed') && selectedCameraIp && (
        <>
          <CardHeader>
             <CardTitle className="flex items-center gap-2">
                {step === 'ready_to_upload_firmware' && <><UploadCloud /> Upload Firmware for {selectedCameraIp}</>}
                {step === 'uploading_firmware' && <><FileCog /> Uploading to {selectedCameraIp}...</>}
                {step === 'installing_firmware' && <><Loader2 className="animate-spin" /> Installing on {selectedCameraIp}...</>}
                {step === 'firmware_update_complete' && <><CheckCircle2 className="text-green-500" /> Update Complete for {selectedCameraIp}</>}
                {step === 'firmware_update_failed' && <><XCircle className="text-red-500" /> Update Failed for {selectedCameraIp}</>}
             </CardTitle>
             {step === 'ready_to_upload_firmware' && <CardDescription>Select a firmware file for {selectedCameraIp}.</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 'ready_to_upload_firmware' && (
              <>
                <Input type="file" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} />
                {file && <p className="text-sm text-muted-foreground">Selected: {file.name}</p>}
              </>
            )}
            {step === 'uploading_firmware' && (
              <div className="text-center">
                <Progress value={progress} className="mb-2" />
                <p>{progress}%</p>
              </div>
            )}
            {step === 'installing_firmware' && (
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-2 text-primary" />
                <p>Installing firmware... Current status: <span className="font-semibold">{installStatusMsg || "Starting..."}</span></p>
                <p className="text-xs text-muted-foreground">This may take several minutes. Do not turn off the camera.</p>
              </div>
            )}
            {(step === 'firmware_update_complete' || step === 'firmware_update_failed') && (
               <Alert variant={step === 'firmware_update_complete' ? 'default' : 'destructive'} 
                      className={step === 'firmware_update_complete' ? 'border-green-500' : ''}>
                <AlertTitle>{step === 'firmware_update_complete' ? 'Success!' : 'Error Occurred'}</AlertTitle>
                <AlertDescription>
                    {step === 'firmware_update_complete' ? `Firmware successfully installed on ${selectedCameraIp}. The camera may reboot.` : `The firmware update process for ${selectedCameraIp} failed. ${installStatusMsg ? `Last status: ${installStatusMsg}. ` : ''}Please check camera logs or try again.`}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex-col space-y-2">
            {renderFooter()}
            {(step === 'ready_to_upload_firmware' || step === 'uploading_firmware' || step === 'installing_firmware' || step === 'firmware_update_failed') && (
              <Button variant="outline" className="w-full" onClick={resetForNewUpdate}>
                Back to Camera Selection
              </Button>
            )}
          </CardFooter>
        </>
      )}
    </Card>
  );
}

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

    