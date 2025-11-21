import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Download,
  UploadIcon,
  Trash2,
  Square,
  Eye,
  EyeOff,
  ShieldCheck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import axios from "axios";

export default function PDFAnonymizer() {
  const [pdfFile, setPdfFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [boxes, setBoxes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentBox, setCurrentBox] = useState(null);
  const [scale, setScale] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnonymized, setIsAnonymized] = useState(false);

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
    setIsAnonymized(false);

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
    const viewport = page.getViewport({ scale: scale });

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
    if (isAnonymized) return;
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPoint(pos);
  };

  // Mouse move - update current box
  const handleMouseMove = (e) => {
    if (!isDrawing || isAnonymized) return;

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
    if (!isDrawing || isAnonymized) return;

    const pos = getMousePos(e);
    const box = {
      x: Math.min(startPoint.x, pos.x),
      y: Math.min(startPoint.y, pos.y),
      width: Math.abs(pos.x - startPoint.x),
      height: Math.abs(pos.y - startPoint.y),
      page: currentPage,
    };

    if (box.width > 5 && box.height > 5) {
      setBoxes([...boxes, box]);
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentBox(null);
  };

  // Apply anonymization
  const applyAnonymization = () => {
    if (boxes.length === 0) {
      alert("Please draw some boxes first");
      return;
    }
    setIsAnonymized(true);
  };

  // Reset to original view
  const resetToOriginal = () => {
    setIsAnonymized(false);
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

    if (isAnonymized) {
      context.fillStyle = "rgb(0, 0, 0)";
      boxes
        .filter((box) => box.page === currentPage)
        .forEach((box) => {
          context.fillRect(box.x, box.y, box.width, box.height);
        });
    } else if (showBoxes) {
      context.fillStyle = "rgba(0, 0, 0, 0.7)";
      context.strokeStyle = "red";
      context.lineWidth = 2;

      boxes
        .filter((box) => box.page === currentPage)
        .forEach((box) => {
          context.fillRect(box.x, box.y, box.width, box.height);
          context.strokeRect(box.x, box.y, box.width, box.height);
        });

      if (currentBox) {
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
    }
  }, [boxes, currentBox, currentPage, showBoxes, isAnonymized, pdfFile]);

  // Generate anonymized PDF
  const generateAnonymizedPDF = async () => {
    if (!pdfFile || boxes.length === 0) {
      alert("Please upload a PDF and draw boxes to anonymize");
      return;
    }

    setIsProcessing(true);

    try {
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

      const boxesByPage = {};
      boxes.forEach((box) => {
        if (!boxesByPage[box.page]) {
          boxesByPage[box.page] = [];
        }
        boxesByPage[box.page].push(box);
      });

      for (const [pageNum, pageBoxes] of Object.entries(boxesByPage)) {
        const page = pages[parseInt(pageNum) - 1];
        const { height } = page.getSize();

        pageBoxes.forEach((box) => {
          const pdfX = box.x * (page.getWidth() / canvasRef.current.width);
          const pdfY =
            height -
            box.y * (height / canvasRef.current.height) -
            box.height * (height / canvasRef.current.height);
          const pdfWidth =
            box.width * (page.getWidth() / canvasRef.current.width);
          const pdfHeight = box.height * (height / canvasRef.current.height);

          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
            color: rgb(0, 0, 0),
          });
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "anonymized_" + (pdfFile.name || "document.pdf");
      a.click();

      URL.revokeObjectURL(url);
      document.body.removeChild(pdfLibScript);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating anonymized PDF. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearBoxes = () => {
    setBoxes([]);
    setIsAnonymized(false);
  };

  const clearCurrentPage = () => {
    setBoxes(boxes.filter((box) => box.page !== currentPage));
    setIsAnonymized(false);
  };

  const uploadAnonymizedPDF = async () => {
    if (!pdfFile || boxes.length === 0) {
      alert("Please upload a PDF and draw boxes to anonymize");
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Load pdf-lib library
      const pdfLibScript = document.createElement("script");
      pdfLibScript.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
      document.body.appendChild(pdfLibScript);

      await new Promise((resolve) => {
        pdfLibScript.onload = resolve;
      });

      const { PDFDocument, rgb } = window.PDFLib;

      // Step 2: Load the original PDF
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();

      // Step 3: Organize boxes by page
      const boxesByPage = {};
      boxes.forEach((box) => {
        if (!boxesByPage[box.page]) {
          boxesByPage[box.page] = [];
        }
        boxesByPage[box.page].push(box);
      });

      // Step 4: Draw black rectangles on each page
      for (const [pageNum, pageBoxes] of Object.entries(boxesByPage)) {
        const page = pages[parseInt(pageNum) - 1];
        const { height } = page.getSize();

        pageBoxes.forEach((box) => {
          const pdfX = box.x * (page.getWidth() / canvasRef.current.width);
          const pdfY =
            height -
            box.y * (height / canvasRef.current.height) -
            box.height * (height / canvasRef.current.height);
          const pdfWidth =
            box.width * (page.getWidth() / canvasRef.current.width);
          const pdfHeight = box.height * (height / canvasRef.current.height);

          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
            color: rgb(0, 0, 0),
          });
        });
      }

      // Step 5: Generate the anonymized PDF bytes
      const pdfBytes = await pdfDoc.save();

      // Step 6: Create FormData for API upload
      const formData = new FormData();
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const anonymizedFilename =
        "anonymized_" + (pdfFile.name || "document.pdf");

      formData.append("file", pdfBlob, anonymizedFilename);
      // Add any other metadata you need

      // Step 7: Upload to your API
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/analytics/upload-text-file/`,
        formData,
        {
          headers: {
            "x-api-key": import.meta.env.VITE_API_KEY,
            // DO NOT set Content-Type → Axios handles it for FormData
          },
        }
      );

      // Step 8: Handle response
      if (!response.data) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("Upload successful:", result);
      document.body.removeChild(pdfLibScript);
    } catch (error) {
      console.error("Error uploading PDF:", error);
      // alert("Error uploading anonymized PDF: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gray-800 rounded-lg shadow-2xl p-6 border border-gray-700">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <Square className="text-red-500" size={36} />
            Tax Anonymizer
          </h1>
          <p className="text-gray-400 mb-6">
            Upload a PDF and draw boxes to redact sensitive information
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
            <>
              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  onClick={() => changePage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft />
                </button>

                <div className="px-4 py-2 bg-gray-700 text-white rounded flex items-center gap-2">
                  <span className="text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                </div>

                <button
                  onClick={() => changePage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight />
                </button>

                {!isAnonymized && (
                  <button
                    onClick={() => setShowBoxes(!showBoxes)}
                    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-2"
                  >
                    {showBoxes ? <EyeOff size={18} /> : <Eye size={18} />}
                    {showBoxes ? "Hide" : "Show"} Boxes
                  </button>
                )}

                {!isAnonymized && (
                  <>
                    <button
                      onClick={clearCurrentPage}
                      className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={18} />
                      Clear Page
                    </button>

                    <button
                      onClick={clearBoxes}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={18} />
                      Clear All ({boxes.length})
                    </button>
                  </>
                )}

                {!isAnonymized ? (
                  <button
                    onClick={applyAnonymization}
                    disabled={boxes.length === 0}
                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2 ml-auto"
                  >
                    <ShieldCheck size={18} />
                    Anonymize Preview
                  </button>
                ) : (
                  <button
                    onClick={resetToOriginal}
                    className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors flex items-center gap-2 ml-auto"
                  >
                    <RotateCcw size={18} />
                    Reset to Original
                  </button>
                )}

                <button
                  onClick={generateAnonymizedPDF}
                  disabled={boxes.length === 0 || isProcessing}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Download size={18} />
                  {isProcessing ? "Processing..." : "Download PDF"}
                </button>

                <button
                  onClick={uploadAnonymizedPDF}
                  disabled={boxes.length === 0 || isProcessing}
                  className="px-4 py-2 bg-red-400 text-white rounded hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <UploadIcon size={18} />
                  {isProcessing ? "Processing..." : "Upload PDF"}
                </button>
              </div>

              {isAnonymized && (
                <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-4 mb-6">
                  <p className="text-yellow-200 font-semibold flex items-center gap-2">
                    <ShieldCheck size={20} />
                    Anonymized Preview Active - All marked areas are now hidden
                  </p>
                </div>
              )}

              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 mb-6">
                <h3 className="text-white font-semibold mb-2">Instructions:</h3>
                <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
                  <li>Click and drag on the PDF to draw redaction boxes</li>
                  <li>
                    Navigate between pages to mark content throughout the
                    document
                  </li>
                  <li>
                    Click &quot;Anonymize Preview&quot; to see how the final
                    document will look
                  </li>
                  <li>
                    Click &quot;Download PDF&quot; to save the anonymized
                    version
                  </li>
                </ul>
              </div>

              <div
                ref={containerRef}
                className="border-2 border-gray-600 rounded-lg overflow-auto bg-gray-900 flex justify-center items-start p-4"
                style={{ maxHeight: "70vh" }}
              >
                <div style={{ position: "relative", display: "inline-block" }}>
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
                    className={
                      isAnonymized ? "shadow-lg" : "cursor-crosshair shadow-lg"
                    }
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      maxWidth: "100%",
                      height: "auto",
                      pointerEvents: isAnonymized ? "none" : "auto",
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 text-center text-gray-400 text-sm">
                {isAnonymized ? (
                  <span className="text-yellow-400 font-semibold">
                    Viewing anonymized version -{" "}
                    {boxes.filter((b) => b.page === currentPage).length} area(s)
                    redacted on this page
                  </span>
                ) : (
                  <span>
                    {boxes.filter((b) => b.page === currentPage).length}{" "}
                    redaction box(es) on this page
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
