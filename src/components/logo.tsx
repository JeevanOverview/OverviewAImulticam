import { Camera } from 'lucide-react';
import type React from 'react';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  iconClassName?: string;
}

export function Logo({ className, iconClassName, ...props }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2 text-primary", className)}>
      <Camera className={cn("h-8 w-8", iconClassName)} />
      <span className="text-2xl font-bold">CamUpdate</span>
    </div>
  );
}

// Helper cn function if not globally available (usually in lib/utils)
// For self-contained component, you might include it or import it
// Assuming cn is available via import { cn } from "@/lib/utils";
import { cn } from "@/lib/utils";
