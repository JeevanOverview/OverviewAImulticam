
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

// Define API endpoints - these are placeholders and should be configured for the actual camera
const API_BASE_URL = (ip: string) => `http://${ip}/api/v1`; // Ensure your camera uses HTTP or change to HTTPS
const STATUS_ENDPOINT = (ip: string) => `${API_BASE_URL(ip)}/device/status`;
const PREPARE_UPDATE_ENDPOINT = (ip: string) => `${API_BASE_URL(ip)}/system/prepare_update`;
const UPLOAD_FIRMWARE_ENDPOINT = (ip: string) => `${API_BASE_URL(ip)}/system/upload_firmware`;


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

  const handleIpSubmit = async (e: FormEvent) => {
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

    const targetUrl = STATUS_ENDPOINT(ipAddress);

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        // Add any necessary headers, e.g., for authentication if required by the camera
        // headers: { 'Authorization': 'Bearer YOUR_TOKEN_HERE' },
      });

      if (response.ok) {
        setCurrentStep('ready_to_prepare');
        toast({ title: 'Connected!', description: `Successfully connected to camera at ${ipAddress}.` });
      } else {
        setStatusMessage(`Failed to connect. Camera responded with Status: ${response.status}. Ensure camera is reachable and API endpoint is correct.`);
        toast({ title: 'Connection Failed', description: `Could not connect to camera at ${ipAddress}. Status: ${response.status}`, variant: 'destructive' });
        setCurrentStep('ip_input');
      }
    } catch (error) {
      console.error(`Connection attempt failed to URL: ${targetUrl}`);
      let userFriendlyMessage = 'Failed to connect to the camera. This could be due to the camera being offline, an incorrect IP address, network issues, or CORS restrictions on the camera. Please check your browser\'s developer console for more specific error messages (especially regarding CORS).';
      
      if (error instanceof Error) {
        console.error(`Error name: ${error.name}`);
        console.error(`Error message: ${error.message}`);
        if (error.stack) {
            console.error(`Stack trace: ${error.stack}`);
        }
      } else {
        console.error('Caught a non-Error object during connection attempt:', error);
      }
      console.error("Full error object:", error);

      setStatusMessage(userFriendlyMessage);
      toast({ title: 'Connection Error', description: userFriendlyMessage, variant: 'destructive' });
      setCurrentStep('ip_input');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrepareUpdate = async () => {
    setIsLoading(true);
    setCurrentStep('preparing_update');
    toast({ title: 'Preparing Update...', description: 'Sending command to camera to prepare for update...' });
    const targetUrl = PREPARE_UPDATE_ENDPOINT(ipAddress);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST', 
      });

      if (response.ok) {
        setCurrentStep('ready_to_upload');
        toast({ title: 'Ready for Firmware', description: 'Camera is ready to receive the firmware file.' });
      } else {
        const errorText = await response.text();
        setStatusMessage(`Failed to prepare camera. Status: ${response.status}. Server said: ${errorText}`);
        toast({ title: 'Preparation Failed', description: `Camera at ${ipAddress} did not prepare for update. Status: ${response.status}`, variant: 'destructive' });
        setCurrentStep('ready_to_prepare');
      }
    } catch (error) {
      console.error(`Prepare update error for URL: ${targetUrl}`);
      let userFriendlyMessage = 'Error preparing camera for update. Check connection, API endpoint, or CORS settings. See browser console for details.';
      if (error instanceof Error) {
        console.error(`Error name: ${error.name}`);
        console.error(`Error message: ${error.message}`);
      }
      console.error("Full error object:", error);
      setStatusMessage(userFriendlyMessage);
      toast({ title: 'Preparation Error', description: userFriendlyMessage, variant: 'destructive' });
      setCurrentStep('ready_to_prepare');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setStatusMessage('');
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile) {
      setStatusMessage('Please select a firmware file.');
      toast({ title: 'Error', description: 'No file selected.', variant: 'destructive' });
      return;
    }
    setStatusMessage('');
    setIsLoading(true);
    setCurrentStep('uploading');
    setUploadProgress(0);

    toast({ title: 'Uploading Firmware...', description: `Sending ${selectedFile.name} to ${ipAddress}.` });

    const formData = new FormData();
    formData.append('firmware', selectedFile); 
    const targetUrl = UPLOAD_FIRMWARE_ENDPOINT(ipAddress);

    try {
      setUploadProgress(10); // Indicate start of process
      const response = await fetch(targetUrl, {
        method: 'POST',
        body: formData,
      });
      setUploadProgress(50); 

      if (response.ok) {
        setUploadProgress(100);
        setCurrentStep('update_complete');
        setStatusMessage(`Firmware ${selectedFile.name} uploaded successfully to ${ipAddress}! Camera may restart.`);
        toast({ title: 'Update Successful!', description: `Firmware ${selectedFile.name} sent to camera.` });
      } else {
        const errorText = await response.text();
        setCurrentStep('update_failed');
        setStatusMessage(`Failed to upload firmware to ${ipAddress}. Status: ${response.status}. Server said: ${errorText}`);
        toast({ title: 'Update Failed', description: `Upload failed. Status: ${response.status}`, variant: 'destructive' });
        setUploadProgress(0);
      }
    } catch (error) {
      console.error(`Upload error for URL: ${targetUrl}`);
      let userFriendlyMessage = 'Failed to upload firmware due to a network, camera error, or CORS issue. See browser console for details.';
       if (error instanceof Error) {
        console.error(`Error name: ${error.name}`);
        console.error(`Error message: ${error.message}`);
      }
      console.error("Full error object:", error);
      setCurrentStep('update_failed');
      setStatusMessage(userFriendlyMessage);
      toast({ title: 'Upload Error', description: userFriendlyMessage, variant: 'destructive' });
      setUploadProgress(0);
    } finally {
      setIsLoading(false);
    }
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
                  disabled={isLoading}
                />
              </div>
              {statusMessage && <Alert variant={currentStep === 'ip_input' && !isLoading ? 'destructive' : 'default'}><AlertDescription>{statusMessage}</AlertDescription></Alert>}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading || !ipAddress}>
                {isLoading ? <Loader2 className="animate-spin" /> : <>Connect <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </CardFooter>
          </form>
        );
      case 'connecting_to_camera':
        return (
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-8 min-h-[200px]">
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
              <CardDescription>Connected to camera at <strong>{ipAddress}</strong>. Proceed to prepare the camera for firmware update.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                This will send a command to the camera to enter firmware update mode if required by its API.
              </p>
               {statusMessage && <Alert variant="destructive"><AlertDescription>{statusMessage}</AlertDescription></Alert>}
            </CardContent>
            <CardFooter className="flex-col space-y-2">
              <Button onClick={handlePrepareUpdate} className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : <>Prepare Camera <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
              <Button onClick={resetState} variant="outline" className="w-full">
                Cancel
              </Button>
            </CardFooter>
          </>
        );
      case 'preparing_update':
        return (
           <CardContent className="flex flex-col items-center justify-center space-y-4 p-8 min-h-[200px]">
            <Loader2 className="h-12 w-12 animate-spin text-accent" />
            <p className="text-lg font-medium">Preparing Camera...</p>
            <p className="text-muted-foreground">Sending command to camera's update interface.</p>
          </CardContent>
        );
      case 'ready_to_upload':
        return (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UploadCloud /> Upload Firmware</CardTitle>
              <CardDescription>Camera at <strong>{ipAddress}</strong> is ready. Select the firmware file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firmwareFile">Firmware File</Label>
                <Input id="firmwareFile" type="file" onChange={handleFileChange} className="text-base" disabled={isLoading} />
              </div>
              {selectedFile && <p className="text-sm text-muted-foreground">Selected: {selectedFile.name}</p>}
              {statusMessage && <Alert variant="destructive"><AlertDescription>{statusMessage}</AlertDescription></Alert>}
            </CardContent>
            <CardFooter className="flex-col space-y-2">
              <Button onClick={handleStartUpload} className="w-full" disabled={isLoading || !selectedFile}>
                {isLoading ? <Loader2 className="animate-spin" /> : <>Start Update <FileCog className="ml-2 h-4 w-4" /></>}
              </Button>
               <Button onClick={resetState} variant="outline" className="w-full">
                Cancel
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
            <CardContent className="space-y-4 text-center">
              {isLoading && <Loader2 className="h-12 w-12 animate-spin text-accent mx-auto mb-4" />}
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-sm text-muted-foreground">
                {uploadProgress === 100 ? "Finalizing..." : (uploadProgress >= 10 ? "Transferring file..." : "Preparing to upload...")}
              </p>
              <p className="text-xs text-muted-foreground">Do not turn off or disconnect the camera.</p>
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
                Update {isSuccess ? 'Process Complete' : 'Process Failed'}
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
                <RefreshCw className="mr-2 h-4 w-4" /> Start New Update Process
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

