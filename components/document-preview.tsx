"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import Image from "next/image";

interface DocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  previewEndpoint: string;
  fileType: string;
}

export function DocumentPreview({
  isOpen,
  onClose,
  fileName,
  previewEndpoint,
  fileType,
}: DocumentPreviewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchFileUrl();
    }
  }, [isOpen]);

  const fetchFileUrl = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(previewEndpoint);
      if (!response.ok) throw new Error("Failed to get file URL");
      const data = await response.json();
      setFileUrl(data.url);
    } catch (err) {
      console.error("Error fetching file URL:", err);
      setError("No se pudo cargar la vista previa");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!fileUrl) return;
    setIsLoading(true);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = fileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsLoading(false);
  };

  const isPdf = fileType.toLowerCase() === "pdf";
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(fileType.toLowerCase());

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-auto">
        <DialogHeader className="flex items-center justify-between">
          <div className="flex-1">
            <DialogTitle className="truncate">{fileName}</DialogTitle>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownload}
            disabled={isLoading || !fileUrl || !!error}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {isLoading ? "Cargando..." : "Descargar"}
          </Button>
        </DialogHeader>

        <div className="mt-4 w-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg min-h-96">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Cargando vista previa...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <FileText className="h-16 w-16 text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
              {fileUrl && (
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Archivo
                </Button>
              )}
            </div>
          ) : fileUrl ? (
            isPdf ? (
              <div className="w-full h-96">
                <iframe
                  src={`${fileUrl}#toolbar=0`}
                  width="100%"
                  height="100%"
                  className="rounded-lg"
                  title={fileName}
                />
              </div>
            ) : isImage ? (
              <div className="relative w-full h-96">
                <Image
                  src={fileUrl}
                  alt={fileName}
                  fill
                  className="object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FileText className="h-16 w-16 text-gray-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Vista previa no disponible para este tipo de archivo
                </p>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Archivo
                </Button>
              </div>
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
