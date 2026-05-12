import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = "light";

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
          "--success-bg": "hsl(var(--popover))",
          "--success-text": "hsl(var(--popover-foreground))",
          "--success-border": "hsl(var(--border))",
          "--error-bg": "hsl(var(--popover))",
          "--error-text": "hsl(var(--popover-foreground))",
          "--error-border": "hsl(var(--destructive))",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
