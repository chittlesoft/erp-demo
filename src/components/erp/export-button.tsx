"use client";
import { Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadCSV, type CsvColumn } from "@/lib/erp/csv";
import type { VariantProps } from "class-variance-authority";

export interface ExportButtonProps {
  /** Base filename (without extension is fine — `.csv` is appended if missing). */
  filename: string;
  rows: ReadonlyArray<Record<string, unknown>>;
  /** Optional explicit column list / order. If omitted, columns are derived from row keys. */
  columns?: CsvColumn[];
  label?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  className?: string;
}

/** Small outline button that exports the provided rows as a CSV download. */
export function ExportButton({
  filename,
  rows,
  columns,
  label = "Export CSV",
  variant = "outline",
  size = "sm",
  disabled,
  className,
}: ExportButtonProps) {
  const { toast } = useToast();

  const onClick = () => {
    if (rows.length === 0) {
      toast({ title: "Nothing to export", description: "There are no rows in this view.", variant: "destructive" });
      return;
    }
    try {
      const finalName = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
      downloadCSV(filename, rows, columns);
      toast({ title: "Export ready", description: `${finalName} · ${rows.length} row${rows.length === 1 ? "" : "s"}` });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || rows.length === 0}
      className={className}
      aria-label={`Export ${rows.length} row${rows.length === 1 ? "" : "s"} to CSV`}
    >
      <Download className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
