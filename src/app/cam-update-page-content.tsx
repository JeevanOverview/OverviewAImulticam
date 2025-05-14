// CamUpdatePageContent.tsx – full revised implementation for new /update API
// -----------------------------------------------------------------------------
// This replaces the legacy prepare-update flow with the camera’s newer firmware
// interface: upload → start → poll. It keeps the same UI layout but removes the
// redundant “prepare” step and provides real upload progress.

'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
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
  Network, UploadCloud, FileCog, CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Helpers / endpoints ----------------------------------------------------------
// -----------------------------------------------------------------------------
const CAM_ORIGIN    = (ip: string) => `http://${ip}`;
const STATUS_URL    = (ip: string) => `${CAM_ORIGIN(ip)}/update/status`;
const UPLOAD_URL    = (ip: string) => `${CAM_ORIGIN(ip)}/update`;
const START_INSTALL = (ip: string) => `${CAM_ORIGIN(ip)}/update/start`;

type Step =
  | 'ip_input'
  | 'connecting'
  | 'ready_to_upload'
  | 'uploading'
  | 'installing'
  | 'update_complete'
  | 'update_failed';

interface StatusResp { status: 'started' | 'finished' | 'reboot_required' | 'error' }

// -----------------------------------------------------------------------------
export default function CamUpdatePageContent() {
  const [ip,       setIp]       = useState('');
  const [step,     setStep]     = useState<Step>('ip_input');
  const [file,     setFile]     = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const { toast } = useToast();

  // ---------------------------------------------------------------------------
  const reset = () => {
    setIp('');
    setStep('ip_input');
    setFile(null);
    setProgress(0);
    setStatusMsg('');
  };

  // ---------------------------------------------------------------------------
  // 1️⃣ Connect ----------------------------------------------------------------
  // ---------------------------------------------------------------------------
  const handleIpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      toast({ variant: 'destructive', title: 'Invalid IP', description: 'Enter a valid IPv4 address.' });
      return;
    }

    setStep('connecting');
    toast({ title: 'Connecting', description: `Pinging ${ip}…` });

    try {
      const res = await fetch(STATUS_URL(ip), { method: 'GET', mode: 'cors' });
      if (res.ok || res.status === 404) {
        toast({ title: 'Connected', description: `Camera at ${ip} is reachable.` });
        setStep('ready_to_upload');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Connection failed', description: String(err) });
      setStep('ip_input');
    }
  };

  // ---------------------------------------------------------------------------
  // 2️⃣ Upload firmware (XHR for progress) --------------------------------------
  // ---------------------------------------------------------------------------
  const startUpload = () => {
    if (!file) return;

    setStep('uploading');
    toast({ title: 'Uploading', description: `${file.name} → ${ip}` });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_URL(ip));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round(100 * e.loaded / e.total));
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        setProgress(100);
        toast({ title: 'Upload complete', description: 'Starting installation…' });
        await startInstall();
      } else {
        fail(`Upload failed (HTTP ${xhr.status})`);
      }
    };

    xhr.onerror = () => fail('Network error during upload');

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  };

  // ---------------------------------------------------------------------------
  // 3️⃣ Start install + poll status -------------------------------------------
  // ---------------------------------------------------------------------------
  const startInstall = async () => {
    setStep('installing');
    try {
      await fetch(START_INSTALL(ip), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file!.name }),
      });

      const poll = setInterval(async () => {
        try {
          const res   = await fetch(STATUS_URL(ip));
          const data: StatusResp = await res.json();
          setStatusMsg(data.status);
          if (data.status === 'finished' || data.status === 'reboot_required') {
            clearInterval(poll);
            setStep('update_complete');
          } else if (data.status === 'error') {
            clearInterval(poll);
            setStep('update_failed');
          }
        } catch { /* swallow, will retry */ }
      }, 3000);

    } catch (err) {
      fail(`Install failed: ${err}`);
    }
  };

  const fail = (msg: string) => {
    toast({ variant: 'destructive', title: 'Error', description: msg });
    setStep('update_failed');
  };

  // ---------------------------------------------------------------------------
  // JSX helpers --------------------------------------------------------------
  // ---------------------------------------------------------------------------
  const footer = () => {
    switch (step) {
      case 'ip_input':
        return (
          <Button type="submit" disabled={!ip} className="w-full">
            Connect <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        );
      case 'ready_to_upload':
        return (
          <Button disabled={!file} className="w-full" onClick={startUpload}>
            Upload & Install <UploadCloud className="ml-2 h-4 w-4" />
          </Button>
        );
      case 'uploading':
      case 'installing':
        return <Button disabled className="w-full"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Please wait…</Button>;
      case 'update_complete':
        return <Button className="w-full" onClick={reset}><RefreshCw className="mr-2 h-4 w-4" /> New Update</Button>;
      default:
        return <Button variant="destructive" className="w-full" onClick={reset}>Reset</Button>;
    }
  };

  // ---------------------------------------------------------------------------
  // Render --------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  return (
    <Card className="w-full max-w-lg shadow-2xl">
      {step === 'ip_input' && (
        <form onSubmit={handleIpSubmit} className="space-y-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Network /> Enter Camera IP</CardTitle>
            <CardDescription>Example: 192.168.0.101</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor="ip">IP Address</Label>
            <Input id="ip" value={ip} onChange={(e) => setIp(e.target.value)} disabled={step !== 'ip_input'} />
          </CardContent>
          <CardFooter>{footer()}</CardFooter>
        </form>
      )}

      {step === 'connecting' && (
        <CardContent className="flex flex-col items-center p-8 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p>Connecting to {ip}…</p>
        </CardContent>
      )}

      {step === 'ready_to_upload' && (
        <>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UploadCloud /> Upload Firmware</CardTitle>
            <CardDescription>Select a firmware file for {ip}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input type="file" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} />
            {file && <p className="text-sm text-muted-foreground">Selected: {file.name}</p>}
          </CardContent>
          <CardFooter>{footer()}</CardFooter>
        </>
      )}

      {step === 'uploading' && (
        <>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileCog /> Uploading…</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-center">
            <Progress value={progress} />
            <p>{progress}%</p>
          </CardContent>
        </>
      )}

      {step === 'installing' && (
        <CardContent className="space-y-2 text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto" />
          <p>Installing… Status: {statusMsg}</p>
        </CardContent>
      )}

      {(step === 'update_complete' || step === 'update_failed') && (
        <>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {step === 'update_complete' ? <CheckCircle2 className="text-green-500" /> : <XCircle className="text-red-500" />} {step === 'update_complete' ? 'Update complete' : 'Update failed'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant={step === 'update_complete' ? 'default' : 'destructive'}>
              <AlertTitle>{step === 'update_complete' ? 'Success' : 'Error'}</AlertTitle>
              <AlertDescription>{step === 'update_complete' ? 'Firmware installed successfully. Camera may reboot.' : 'See logs or try again.'}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter>{footer()}</CardFooter>
        </>
      )}
    </Card>
  );
}
