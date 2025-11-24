import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Download,
  UploadIcon,
  Trash2,
  Square,
  ChevronLeft,
  ChevronRight,
  Edit3,
  X,
} from "lucide-react";
import axios from "axios";
import { toast } from "react-toastify";

export default function PDFAnonymizer() {
  const [pdfFile, setPdfFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [boxes, setBoxes] = useState([]); // All boxes (both redactions and text replacements)
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentBox, setCurrentBox] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Text replacement modal
  const [editingBox, setEditingBox] = useState(null);
  const [replacementText, setReplacementText] = useState("");

  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const pdfDocRef = useRef(null);

  // Load PDF.js
  useEffect(() => {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Handle PDF file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a valid PDF file");
      return;
    }

    setPdfFile(file);
    setBoxes([]);
    setCurrentPage(1);
    setEditingBox(null);

    const arrayBuffer = await file.arrayBuffer();
    const typedArray = new Uint8Array(arrayBuffer);

    const loadingTask = window.pdfjsLib.getDocument(typedArray);
    const pdf = await loadingTask.promise;
    pdfDocRef.current = pdf;
    setTotalPages(pdf.numPages);

    renderPage(pdf, 1);
  };

  // Render PDF page
  const renderPage = async (pdf, pageNum) => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
  };

  // Handle page navigation
  const changePage = async (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    if (pdfDocRef.current) {
      await renderPage(pdfDocRef.current, newPage);
    }
  };

  // Get mouse position relative to canvas
  const getMousePos = (e) => {
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  // Mouse down - start drawing
  const handleMouseDown = (e) => {
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPoint(pos);
  };

  // Mouse move - update current box
  const handleMouseMove = (e) => {
    if (!isDrawing) return;

    const pos = getMousePos(e);
    setCurrentBox({
      x: Math.min(startPoint.x, pos.x),
      y: Math.min(startPoint.y, pos.y),
      width: Math.abs(pos.x - startPoint.x),
      height: Math.abs(pos.y - startPoint.y),
      page: currentPage,
    });
  };

  // Mouse up - finish drawing
  const handleMouseUp = (e) => {
    if (!isDrawing) return;

    const pos = getMousePos(e);
    const box = {
      x: Math.min(startPoint.x, pos.x),
      y: Math.min(startPoint.y, pos.y),
      width: Math.abs(pos.x - startPoint.x),
      height: Math.abs(pos.y - startPoint.y),
      page: currentPage,
      id: Date.now(),
      text: "", // Empty means redaction (black box)
    };

    if (box.width > 5 && box.height > 5) {
      // Open modal to ask for replacement text
      setEditingBox(box);
      setReplacementText("");
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentBox(null);
  };

  // Calculate dynamic font size based on box dimensions and text length
  const calculateFontSize = (text, boxWidth, boxHeight) => {
    if (!text) return 12;

    const minFontSize = 8;
    const maxFontSize = 36;
    const avgCharWidth = 0.6;
    const textLength = text.length;

    const widthBasedSize = (boxWidth / (textLength * avgCharWidth)) * 2;
    const heightBasedSize = boxHeight * 0.8;

    let fontSize = Math.min(widthBasedSize, heightBasedSize);
    fontSize = Math.max(minFontSize, Math.min(maxFontSize, fontSize));

    return Math.floor(fontSize);
  };

  // Save box (with or without text replacement)
  const saveBox = () => {
    if (!editingBox) return;

    const boxToSave = {
      ...editingBox,
      text: replacementText.trim(),
      fontSize: replacementText.trim()
        ? calculateFontSize(
            replacementText.trim(),
            editingBox.width,
            editingBox.height
          )
        : 0,
    };

    if (editingBox.isEditing) {
      // Update existing box
      setBoxes(boxes.map((b) => (b.id === editingBox.id ? boxToSave : b)));
    } else {
      // Add new box
      setBoxes([...boxes, boxToSave]);
    }

    setEditingBox(null);
    setReplacementText("");
  };

  // Edit existing box
  const editBox = (box) => {
    setEditingBox({ ...box, isEditing: true });
    setReplacementText(box.text || "");
  };

  // Delete box
  const deleteBox = (id) => {
    setBoxes(boxes.filter((b) => b.id !== id));
  };

  // Render PDF page (only when page changes or PDF loads)
  useEffect(() => {
    if (!canvasRef.current || !pdfDocRef.current) return;
    renderPage(pdfDocRef.current, currentPage);
  }, [currentPage, pdfFile]);

  // Draw boxes overlay on separate canvas
  useEffect(() => {
    if (!overlayCanvasRef.current || !canvasRef.current) return;

    const overlayCanvas = overlayCanvasRef.current;
    const pdfCanvas = canvasRef.current;
    const context = overlayCanvas.getContext("2d");

    // Match overlay canvas size to PDF canvas
    overlayCanvas.width = pdfCanvas.width;
    overlayCanvas.height = pdfCanvas.height;

    // Clear overlay
    context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Draw all boxes for current page
    boxes
      .filter((box) => box.page === currentPage)
      .forEach((box) => {
        if (box.text) {
          // Text replacement: white background with text
          context.fillStyle = "rgba(255, 255, 255, 0.9)";
          context.fillRect(box.x, box.y, box.width, box.height);

          context.strokeStyle = "green";
          context.lineWidth = 2;
          context.strokeRect(box.x, box.y, box.width, box.height);

          // Draw text
          context.fillStyle = "rgb(0, 0, 0)";
          context.font = `${box.fontSize || 12}px Arial`;
          context.textBaseline = "middle";
          context.textAlign = "center";

          const textX = box.x + box.width / 2;
          const textY = box.y + box.height / 2;

          context.fillText(box.text, textX, textY);
        } else {
          // Redaction: black box
          context.fillStyle = "rgba(0, 0, 0, 0.8)";
          context.fillRect(box.x, box.y, box.width, box.height);

          context.strokeStyle = "red";
          context.lineWidth = 2;
          context.strokeRect(box.x, box.y, box.width, box.height);
        }
      });

    // Draw current box (while drawing)
    if (currentBox) {
      context.fillStyle = "rgba(100, 100, 100, 0.5)";
      context.strokeStyle = "blue";
      context.lineWidth = 2;
      context.fillRect(
        currentBox.x,
        currentBox.y,
        currentBox.width,
        currentBox.height
      );
      context.strokeRect(
        currentBox.x,
        currentBox.y,
        currentBox.width,
        currentBox.height
      );
    }
  }, [boxes, currentBox, currentPage, pdfFile]);

  // Generate anonymized PDF (consolidated logic)
  const generateAnonymizedPDF = async () => {
    if (!pdfFile || boxes.length === 0) {
      alert("Please upload a PDF and draw boxes to anonymize");
      return null;
    }

    const pdfLibScript = document.createElement("script");
    pdfLibScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
    document.body.appendChild(pdfLibScript);

    await new Promise((resolve) => {
      pdfLibScript.onload = resolve;
    });

    const { PDFDocument, rgb } = window.PDFLib;

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();

    // Group boxes by page
    const boxesByPage = {};
    boxes.forEach((box) => {
      if (!boxesByPage[box.page]) {
        boxesByPage[box.page] = [];
      }
      boxesByPage[box.page].push(box);
    });

    // Process each page
    for (const [pageNum, pageBoxes] of Object.entries(boxesByPage)) {
      const page = pages[parseInt(pageNum) - 1];
      const { height, width } = page.getSize();

      pageBoxes.forEach((box) => {
        const pdfX = box.x * (width / canvasRef.current.width);
        const pdfY =
          height -
          box.y * (height / canvasRef.current.height) -
          box.height * (height / canvasRef.current.height);
        const pdfWidth = box.width * (width / canvasRef.current.width);
        const pdfHeight = box.height * (height / canvasRef.current.height);

        if (box.text) {
          // Text replacement: white background
          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
            color: rgb(1, 1, 1),
          });

          // Draw text
          const pdfFontSize =
            (box.fontSize || 12) * (height / canvasRef.current.height);

          page.drawText(box.text, {
            x: pdfX,
            y: pdfY + pdfHeight - pdfFontSize,
            size: pdfFontSize,
            color: rgb(0, 0, 0),
            lineHeight: 1,
            maxWidth: pdfWidth - 4,
            wordBreaks: [" "],
          });
        } else {
          // Redaction: black box
          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
            color: rgb(0, 0, 0),
          });
        }
      });
    }

    const pdfBytes = await pdfDoc.save();
    document.body.removeChild(pdfLibScript);

    return pdfBytes;
  };

  // Download PDF
  const downloadPDF = async () => {
    setIsProcessing(true);
    try {
      const pdfBytes = await generateAnonymizedPDF();
      if (!pdfBytes) return;

      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "anonymized_" + (pdfFile.name || "document.pdf");
      a.click();

      URL.revokeObjectURL(url);
      toast.success("PDF downloaded successfully!", {
        position: "bottom-right",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Error generating anonymized PDF. Please try again.", {
        position: "bottom-right",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload PDF
  const uploadPDF = async () => {
    setIsProcessing(true);
    try {
      const pdfBytes = await generateAnonymizedPDF();
      if (!pdfBytes) return;

      const formData = new FormData();
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const anonymizedFilename =
        "anonymized_" + (pdfFile.name || "document.pdf");

      formData.append("file", pdfBlob, anonymizedFilename);

      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/analytics/upload-text-file/`,
        formData
      );

      if (!response.data) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      console.log("Upload successful:", response.data);
      toast.success("PDF uploaded successfully!", { position: "bottom-right" });
    } catch (error) {
      console.error("Error uploading PDF:", error);
      toast.error(
        "There was some issue in uploading PDF. Please try again later.",
        { position: "bottom-right" }
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAllBoxes = () => {
    setBoxes([]);
  };

  const clearCurrentPageBoxes = () => {
    setBoxes(boxes.filter((box) => box.page !== currentPage));
  };

  const currentPageBoxes = boxes.filter((b) => b.page === currentPage);
  const redactionCount = currentPageBoxes.filter((b) => !b.text).length;
  const replacementCount = currentPageBoxes.filter((b) => b.text).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gray-800 rounded-lg shadow-2xl p-6 border border-gray-700">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <Square className="text-red-500" size={36} />
            Tax Anonymizer
          </h1>
          <p className="text-gray-400 mb-6">
            Upload a PDF and draw boxes to redact or replace text
          </p>

          <div className="mb-6">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-700 hover:bg-gray-650 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-10 h-10 mb-3 text-gray-400" />
                <p className="mb-2 text-sm text-gray-400">
                  <span className="font-semibold">Click to upload</span> or drag
                  and drop
                </p>
                <p className="text-xs text-gray-500">PDF files only</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept="application/pdf"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {pdfFile && (
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex flex-col w-full md:w-64 flex-shrink-0 gap-2">
                {/* Page Navigation */}
                <div className="flex gap-2">
                  <button
                    onClick={() => changePage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex-1"
                  >
                    <ChevronLeft size={18} className="inline" />
                  </button>

                  <div className="px-4 py-2 bg-gray-700 text-white rounded flex items-center justify-center flex-1">
                    <span className="text-sm">
                      Page {currentPage} / {totalPages}
                    </span>
                  </div>

                  <button
                    onClick={() => changePage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex-1"
                  >
                    <ChevronRight size={18} className="inline" />
                  </button>
                </div>

                {/* Clear buttons */}
                <button
                  onClick={clearCurrentPageBoxes}
                  className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-2 justify-center"
                >
                  <Trash2 size={18} />
                  Clear Page ({currentPageBoxes.length})
                </button>

                <button
                  onClick={clearAllBoxes}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-2 justify-center"
                >
                  <Trash2 size={18} />
                  Clear All ({boxes.length})
                </button>

                <div className="border-t border-gray-600 my-2"></div>

                {/* Download and Upload */}
                <button
                  onClick={downloadPDF}
                  disabled={boxes.length === 0 || isProcessing}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2 justify-center"
                >
                  <Download size={18} />
                  {isProcessing ? "Processing..." : "Download PDF"}
                </button>

                <button
                  onClick={uploadPDF}
                  disabled={boxes.length === 0 || isProcessing}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2 justify-center"
                >
                  <UploadIcon size={18} />
                  {isProcessing ? "Processing..." : "Upload PDF"}
                </button>

                {/* Info box */}
                <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 mt-4">
                  <h3 className="text-white font-semibold mb-2 text-sm">
                    Current Page:
                  </h3>
                  <div className="text-gray-300 text-sm space-y-1">
                    <div>Redactions: {redactionCount}</div>
                    <div>Replacements: {replacementCount}</div>
                    <div className="text-xs text-gray-400 mt-2">
                      Total: {boxes.length} box(es) across all pages
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1">
                {/* Boxes list for current page */}
                {currentPageBoxes.length > 0 && (
                  <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 mb-4">
                    <h3 className="text-white font-semibold mb-2">
                      Boxes on Page {currentPage}:
                    </h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {currentPageBoxes.map((box, idx) => (
                        <div
                          key={box.id}
                          className="flex items-center justify-between bg-gray-600 p-2 rounded"
                        >
                          <div className="flex-1">
                            <span className="text-white text-sm">
                              {box.text ? (
                                <span>
                                  <span className="text-green-400">
                                    Replace:
                                  </span>{" "}
                                  &quot;{box.text}&quot;
                                </span>
                              ) : (
                                <span>
                                  <span className="text-red-400">
                                    Redact
                                  </span>{" "}
                                  #{idx + 1}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => editBox(box)}
                              className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => deleteBox(box.id)}
                              className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                              title="Delete"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PDF viewer */}
                <div
                  ref={containerRef}
                  className="border-2 border-gray-600 rounded-lg overflow-auto bg-gray-900 flex justify-center items-start p-4"
                  style={{ maxHeight: "70vh" }}
                >
                  <div
                    style={{ position: "relative", display: "inline-block" }}
                  >
                    <canvas
                      ref={canvasRef}
                      className="shadow-lg"
                      style={{
                        maxWidth: "100%",
                        height: "auto",
                        display: "block",
                      }}
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      className="cursor-crosshair shadow-lg"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        maxWidth: "100%",
                        height: "auto",
                      }}
                    />
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 mt-4">
                  <h3 className="text-white font-semibold mb-2">
                    Instructions:
                  </h3>
                  <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
                    <li>Click and drag on the PDF to draw boxes</li>
                    <li>
                      For each box, choose to add replacement text or leave
                      empty for redaction
                    </li>
                    <li>
                      <span className="text-red-400">Red boxes</span> = full
                      redaction (black)
                    </li>
                    <li>
                      <span className="text-green-400">Green boxes</span> = text
                      replacement
                    </li>
                    <li>Navigate pages to mark content throughout the document</li>
                    <li>Click Download or Upload when ready</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Text Replacement Modal */}
          {editingBox && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-600 w-96 max-w-full shadow-xl">
                <h3 className="text-white text-lg font-semibold mb-4">
                  {editingBox.isEditing ? "Edit Box" : "Add Box"}
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Enter replacement text, or leave empty to redact (black box)
                </p>
                <textarea
                  value={replacementText}
                  onChange={(e) => setReplacementText(e.target.value)}
                  placeholder="Enter replacement text (optional)..."
                  className="w-full h-32 p-3 bg-gray-700 text-white border border-gray-600 rounded mb-4 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setEditingBox(null);
                      setReplacementText("");
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveBox}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
