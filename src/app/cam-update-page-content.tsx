'use client';

import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Network, UploadCloud, FileCog, CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw, Settings2 } from 'lucide-react';

type Step =
  | 'ip_input'
  | 'connecting_to_camera'
  | 'ready_to_prepare'
  | 'preparing_update'
  | 'ready_to_upload'
  | 'uploading'
  | 'update_complete'
  | 'update_failed';

export default function CamUpdatePageContent() {
  const [ipAddress, setIpAddress] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<Step>('ip_input');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const { toast } = useToast();

  const resetState = () => {
    setIpAddress('');
    setCurrentStep('ip_input');
    setSelectedFile(null);
    setUploadProgress(0);
    setStatusMessage('');
    setIsLoading(false);
  };

  const handleIpSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ipAddress.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
      setStatusMessage('Invalid IP address format.');
      toast({ title: 'Error', description: 'Invalid IP address format.', variant: 'destructive' });
      return;
    }
    setStatusMessage('');
    setIsLoading(true);
    setCurrentStep('connecting_to_camera');
    toast({ title: 'Connecting...', description: `Attempting to connect to ${ipAddress}` });
    setTimeout(() => {
      setIsLoading(false);
      setCurrentStep('ready_to_prepare');
      toast({ title: 'Connected!', description: `Successfully connected to camera at ${ipAddress}.` });
    }, 2000);
  };

  const handlePrepareUpdate = () => {
    setIsLoading(true);
    setCurrentStep('preparing_update');
    toast({ title: 'Preparing Update...', description: 'Accessing camera update settings...' });
    setTimeout(() => {
      setIsLoading(false);
      setCurrentStep('ready_to_upload');
      toast({ title: 'Ready for Firmware', description: 'Camera is ready to receive the firmware file.' });
    }, 2500);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setStatusMessage('');
    }
  };

  const handleStartUpload = () => {
    if (!selectedFile) {
      setStatusMessage('Please select a firmware file.');
      toast({ title: 'Error', description: 'No file selected.', variant: 'destructive' });
      return;
    }
    setStatusMessage('');
    setIsLoading(true);
    setCurrentStep('uploading');
    setUploadProgress(0);

    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress <= 100) {
        setUploadProgress(progress);
      } else {
        clearInterval(interval);
        setIsLoading(false);
        // Simulate success/failure
        if (Math.random() > 0.2) { // 80% chance of success
          setCurrentStep('update_complete');
          setStatusMessage(`Firmware ${selectedFile.name} uploaded successfully to ${ipAddress}!`);
          toast({ title: 'Update Successful!', description: `Firmware ${selectedFile.name} installed.` });
        } else {
          setCurrentStep('update_failed');
          setStatusMessage(`Failed to upload firmware to ${ipAddress}. Please try again.`);
          toast({ title: 'Update Failed', description: 'An error occurred during the update.', variant: 'destructive' });
        }
      }
    }, 300);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'ip_input':
        return (
          <form onSubmit={handleIpSubmit} className="space-y-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Network /> Enter Camera IP Address</CardTitle>
              <CardDescription>Enter the IP address of the camera you want to update.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ipAddress">IP Address</Label>
                <Input
                  id="ipAddress"
                  type="text"
                  placeholder="e.g., 192.168.1.100"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  required
                  className="text-lg"
                />
              </div>
              {statusMessage && <Alert variant="destructive"><AlertDescription>{statusMessage}</AlertDescription></Alert>}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : <>Connect <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </CardFooter>
          </form>
        );
      case 'connecting_to_camera':
        return (
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-8">
            <Loader2 className="h-12 w-12 animate-spin text-accent" />
            <p className="text-lg font-medium">Connecting to {ipAddress}...</p>
            <p className="text-muted-foreground">Please wait while we establish a connection.</p>
          </CardContent>
        );
      case 'ready_to_prepare':
        return (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings2 /> Prepare Camera for Update</CardTitle>
              <CardDescription>Connected to camera at <strong>{ipAddress}</strong>. Proceed to access update settings.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                This step conceptually represents navigating to the camera's software/firmware update section in its web interface.
              </p>
            </CardContent>
            <CardFooter>
              <Button onClick={handlePrepareUpdate} className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : <>Access Update Settings <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </CardFooter>
          </>
        );
      case 'preparing_update':
        return (
           <CardContent className="flex flex-col items-center justify-center space-y-4 p-8">
            <Loader2 className="h-12 w-12 animate-spin text-accent" />
            <p className="text-lg font-medium">Accessing Update Settings...</p>
            <p className="text-muted-foreground">Simulating interaction with camera's interface.</p>
          </CardContent>
        );
      case 'ready_to_upload':
        return (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UploadCloud /> Upload Firmware</CardTitle>
              <CardDescription>Select the firmware file for camera at <strong>{ipAddress}</strong>.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firmwareFile">Firmware File</Label>
                <Input id="firmwareFile" type="file" onChange={handleFileChange} className="text-base" />
              </div>
              {selectedFile && <p className="text-sm text-muted-foreground">Selected: {selectedFile.name}</p>}
              {statusMessage && <Alert variant="destructive"><AlertDescription>{statusMessage}</AlertDescription></Alert>}
            </CardContent>
            <CardFooter>
              <Button onClick={handleStartUpload} className="w-full" disabled={isLoading || !selectedFile}>
                {isLoading ? <Loader2 className="animate-spin" /> : <>Start Update <FileCog className="ml-2 h-4 w-4" /></>}
              </Button>
            </CardFooter>
          </>
        );
      case 'uploading':
        return (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileCog /> Uploading Firmware</CardTitle>
              <CardDescription>Uploading {selectedFile?.name} to <strong>{ipAddress}</strong>. Please wait.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-center text-lg font-semibold text-accent">{uploadProgress}%</p>
              <p className="text-sm text-center text-muted-foreground">Do not turn off or disconnect the camera.</p>
            </CardContent>
          </>
        );
      case 'update_complete':
      case 'update_failed':
        const isSuccess = currentStep === 'update_complete';
        return (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isSuccess ? <CheckCircle2 className="text-green-500" /> : <XCircle className="text-red-500" />}
                Update {isSuccess ? 'Successful' : 'Failed'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant={isSuccess ? 'default' : 'destructive'} className={isSuccess ? "border-green-500" : ""}>
                {isSuccess ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                <AlertTitle>{isSuccess ? 'Success!' : 'Error!'}</AlertTitle>
                <AlertDescription>{statusMessage}</AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter>
              <Button onClick={resetState} className="w-full" variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" /> Start New Update
              </Button>
            </CardFooter>
          </>
        );
      default:
        return <p>Unknown step.</p>;
    }
  };

  return (
    <Card className="w-full max-w-lg shadow-2xl">
      {renderStepContent()}
    </Card>
  );
}
