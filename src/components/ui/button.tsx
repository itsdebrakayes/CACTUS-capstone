import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({ className, type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn("inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50", className)} {...props} />;
}