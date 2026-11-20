"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, File, Trash, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { DocumentPreview } from "@/components/document-preview";

interface FileUploadProps {
  budgetId: string;
  files: any[];
  onFilesChange: () => void;
}

export function FileUpload({ budgetId, files, onFilesChange }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const presignedResponse = await fetch(
        `/api/budgets/${budgetId}/files/presigned`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            fileType: "OTRO",
          }),
        }
      );

      if (!presignedResponse.ok) throw new Error("Failed to get upload URL");

      const { uploadUrl } = await presignedResponse.json();

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) throw new Error("Upload failed");

      toast.success("Archivo subido exitosamente");
      onFilesChange();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      const response = await fetch(
        `/api/budgets/${budgetId}/files/${fileId}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete");

      toast.success("Archivo eliminado");
      onFilesChange();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Error al eliminar el archivo");
    }
  };

  const handleDownloadFile = (fileUrl: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = fileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenPreview = (file: any) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const getDownloadUrl = (file: any) => {
    return `/api/budgets/${budgetId}/files/${file.id}/download`;
  };

  const getPreviewUrl = (file: any) => {
    return `/api/budgets/${budgetId}/files/${file.id}/preview`;
  };

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-gray-300 hover:border-blue-500 dark:border-gray-600 dark:hover:border-blue-400 p-8 text-center cursor-pointer transition-colors rounded-lg"
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleUpload(e.target.files[0]);
            }
          }}
        />

        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 font-semibold">Arrastra archivos aquí o haz clic</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          PDF, imágenes, documentos (máx 100MB)
        </p>

        <Button
          onClick={() => fileInputRef.current?.click()}
          className="mt-4"
          disabled={uploading}
        >
          {uploading ? "Subiendo..." : "Seleccionar Archivo"}
        </Button>
      </div>

      {files && files.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Archivos ({files.length})</h3>
          <div className="space-y-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded">
                    <File className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.filename}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(file.uploadedAt).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 ml-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-8"
                    onClick={() => handleOpenPreview(file)}
                    title="Ver documento"
                  >
                    <Eye className="h-4 w-4" />
                    <span className="hidden sm:inline">Ver</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-8"
                    onClick={() => handleDownloadFile(getDownloadUrl(file), file.filename)}
                    title="Descargar documento"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Descargar</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => handleDeleteFile(file.id)}
                    title="Eliminar documento"
                  >
                    <Trash className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {previewFile && (
        <DocumentPreview
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          fileName={previewFile.filename}
          previewEndpoint={getPreviewUrl(previewFile)}
          fileType={previewFile.filename.split(".").pop()?.toLowerCase() || ""}
        />
      )}
    </div>
  );
}
