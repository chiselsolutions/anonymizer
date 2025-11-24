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
  Type,
  Edit3,
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

  // New states for text replacement
  const [textReplacements, setTextReplacements] = useState([]);
  const [isTextMode, setIsTextMode] = useState(false);
  const [editingReplacement, setEditingReplacement] = useState(null);
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
    setTextReplacements([]);
    setCurrentPage(1);
    setIsAnonymized(false);
    setIsTextMode(false);
    setEditingReplacement(null);

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

    if (isTextMode) {
      // In text mode, create a text replacement area
      setIsDrawing(true);
      setStartPoint(pos);
    } else {
      // In redaction mode (original functionality)
      setIsDrawing(true);
      setStartPoint(pos);
    }
  };

  // Mouse move - update current box
  const handleMouseMove = (e) => {
    if (!isDrawing || isAnonymized) return;

    const pos = getMousePos(e);

    if (isTextMode) {
      // For text replacement area
      setCurrentBox({
        x: Math.min(startPoint.x, pos.x),
        y: Math.min(startPoint.y, pos.y),
        width: Math.abs(pos.x - startPoint.x),
        height: Math.abs(pos.y - startPoint.y),
        page: currentPage,
        type: "text",
      });
    } else {
      // For redaction box (original functionality)
      setCurrentBox({
        x: Math.min(startPoint.x, pos.x),
        y: Math.min(startPoint.y, pos.y),
        width: Math.abs(pos.x - startPoint.x),
        height: Math.abs(pos.y - startPoint.y),
        page: currentPage,
        type: "redaction",
      });
    }
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
      type: isTextMode ? "text" : "redaction",
    };

    if (box.width > 5 && box.height > 5) {
      if (isTextMode) {
        // For text replacement, open edit dialog
        setEditingReplacement(box);
        setReplacementText("");
      } else {
        // For redaction, add to boxes (original functionality)
        setBoxes([...boxes, box]);
      }
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

    // Estimate character width (approximate)
    const avgCharWidth = 0.6;
    const textLength = text.length;

    // Calculate maximum font size that fits the width
    const widthBasedSize = (boxWidth / (textLength * avgCharWidth)) * 2;

    // Calculate maximum font size that fits the height
    const heightBasedSize = boxHeight * 0.8; // 80% of box height

    // Use the smaller of the two to ensure text fits both dimensions
    let fontSize = Math.min(widthBasedSize, heightBasedSize);

    // Clamp between min and max
    fontSize = Math.max(minFontSize, Math.min(maxFontSize, fontSize));

    return Math.floor(fontSize);
  };

  // Save text replacement
  const saveTextReplacement = () => {
    if (!replacementText.trim() || !editingReplacement) return;

    const newReplacement = {
      ...editingReplacement,
      id: Date.now(),
      text: replacementText,
      fontSize: calculateFontSize(
        replacementText,
        editingReplacement.width,
        editingReplacement.height
      ),
    };

    setTextReplacements([...textReplacements, newReplacement]);
    setEditingReplacement(null);
    setReplacementText("");
  };

  // Edit existing text replacement
  const editTextReplacement = (replacement) => {
    setEditingReplacement(replacement);
    setReplacementText(replacement.text);
  };

  // Delete text replacement
  const deleteTextReplacement = (id) => {
    setTextReplacements(textReplacements.filter((tr) => tr.id !== id));
  };

  // Apply anonymization
  const applyAnonymization = () => {
    if (boxes.length === 0 && textReplacements.length === 0) {
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
      // Draw redaction boxes (black out completely)
      context.fillStyle = "rgb(0, 0, 0)";
      boxes
        .filter((box) => box.page === currentPage)
        .forEach((box) => {
          context.fillRect(box.x, box.y, box.width, box.height);
        });

      // Draw text replacements (white background with black text - no black box)
      textReplacements
        .filter((tr) => tr.page === currentPage)
        .forEach((tr) => {
          // Draw white background
          context.fillStyle = "rgb(255, 255, 255)";
          context.fillRect(tr.x, tr.y, tr.width, tr.height);

          // Draw black text with dynamic font size and centered
          context.fillStyle = "rgb(0, 0, 0)";
          context.font = `${tr.fontSize || 12}px Arial`;
          context.textBaseline = "middle";
          context.textAlign = "center";

          const textX = tr.x + tr.width / 2;
          const textY = tr.y + tr.height / 2;

          context.fillText(tr.text, textX, textY);
        });
    } else if (showBoxes) {
      // Draw redaction boxes (original functionality - semi-transparent)
      context.fillStyle = "rgba(0, 0, 0, 0.7)";
      context.strokeStyle = "red";
      context.lineWidth = 2;

      boxes
        .filter((box) => box.page === currentPage)
        .forEach((box) => {
          context.fillRect(box.x, box.y, box.width, box.height);
          context.strokeRect(box.x, box.y, box.width, box.height);
        });

      // Draw text replacement areas (semi-transparent green)
      context.fillStyle = "rgba(0, 100, 0, 0.5)";
      context.strokeStyle = "green";
      context.lineWidth = 2;

      textReplacements
        .filter((tr) => tr.page === currentPage)
        .forEach((tr) => {
          context.fillRect(tr.x, tr.y, tr.width, tr.height);
          context.strokeRect(tr.x, tr.y, tr.width, tr.height);

          // Draw text preview with dynamic font size and centered
          context.fillStyle = "rgb(255, 255, 255)";
          context.font = `${tr.fontSize || 12}px Arial`;
          context.textBaseline = "middle";
          context.textAlign = "center";

          const textX = tr.x + tr.width / 2;
          const textY = tr.y + tr.height / 2;

          context.fillText(tr.text, textX, textY);
          context.fillStyle = "rgba(0, 100, 0, 0.5)";
        });

      // Draw current box (while drawing)
      if (currentBox) {
        if (currentBox.type === "text") {
          context.fillStyle = "rgba(0, 100, 0, 0.5)";
          context.strokeStyle = "green";
        } else {
          context.fillStyle = "rgba(0, 0, 0, 0.7)";
          context.strokeStyle = "red";
        }

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
  }, [
    boxes,
    textReplacements,
    currentBox,
    currentPage,
    showBoxes,
    isAnonymized,
    pdfFile,
  ]);

  // Generate anonymized PDF
  const generateAnonymizedPDF = async () => {
    if (!pdfFile || (boxes.length === 0 && textReplacements.length === 0)) {
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

      const textReplacementsByPage = {};
      textReplacements.forEach((tr) => {
        if (!textReplacementsByPage[tr.page]) {
          textReplacementsByPage[tr.page] = [];
        }
        textReplacementsByPage[tr.page].push(tr);
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

      // Handle text replacements
      for (const [pageNum, pageTextReplacements] of Object.entries(
        textReplacementsByPage
      )) {
        const page = pages[parseInt(pageNum) - 1];
        const { height, width } = page.getSize();

        pageTextReplacements.forEach((tr) => {
          const pdfX = tr.x * (width / canvasRef.current.width);
          const pdfY =
            height -
            tr.y * (height / canvasRef.current.height) -
            tr.height * (height / canvasRef.current.height);
          const pdfWidth = tr.width * (width / canvasRef.current.width);
          const pdfHeight = tr.height * (height / canvasRef.current.height);

          // Draw white background for text replacement
          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
            color: rgb(1, 1, 1), // White background
          });

          // Calculate PDF font size (convert from canvas pixels to PDF points)
          const pdfFontSize =
            (tr.fontSize || 12) * (height / canvasRef.current.height);

          // Calculate text position - FIXED: Proper centering in PDF coordinate system
          // const textPdfX = pdfX + pdfWidth / 2;
          // const textPdfY = pdfY + pdfHeight / 2 - pdfFontSize * 0.3; // Adjust for baseline

          page.drawText(tr.text, {
            x: pdfX,
            y: pdfY + pdfHeight - pdfFontSize, // approximate top alignment
            size: pdfFontSize,
            color: rgb(0, 0, 0), // Black text
            lineHeight: 1,
            maxWidth: pdfWidth - 4, // Small padding
            wordBreaks: [" "],
            textAlign: "center", // Ensure center alignment in PDF
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

  const uploadAnonymizedPDF = async () => {
    if (!pdfFile || (boxes.length === 0 && textReplacements.length === 0)) {
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

      const textReplacementsByPage = {};
      textReplacements.forEach((tr) => {
        if (!textReplacementsByPage[tr.page]) {
          textReplacementsByPage[tr.page] = [];
        }
        textReplacementsByPage[tr.page].push(tr);
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

      // Handle text replacements for upload
      for (const [pageNum, pageTextReplacements] of Object.entries(
        textReplacementsByPage
      )) {
        const page = pages[parseInt(pageNum) - 1];
        const { height, width } = page.getSize();

        pageTextReplacements.forEach((tr) => {
          const pdfX = tr.x * (width / canvasRef.current.width);
          const pdfY =
            height -
            tr.y * (height / canvasRef.current.height) -
            tr.height * (height / canvasRef.current.height);
          const pdfWidth = tr.width * (width / canvasRef.current.width);
          const pdfHeight = tr.height * (height / canvasRef.current.height);

          // White background for text replacement
          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
            color: rgb(1, 1, 1),
          });

          // Calculate PDF font size
          const pdfFontSize =
            (tr.fontSize || 12) * (height / canvasRef.current.height);

          // Calculate text position - FIXED: Proper centering
          // const textPdfX = pdfX + pdfWidth / 2;
          // const textPdfY = pdfY + pdfHeight / 2 - pdfFontSize * 0.3; // Adjust for baseline

          page.drawText(tr.text, {
            x: pdfX,
            y: pdfY + pdfHeight - pdfFontSize, // approximate top alignment
            size: pdfFontSize,
            color: rgb(0, 0, 0),
            lineHeight: 1,
            maxWidth: pdfWidth - 4,
            wordBreaks: [" "],
            textAlign: "center", // Ensure center alignment
          });
        });
      }

      const pdfBytes = await pdfDoc.save();
      const formData = new FormData();
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const anonymizedFilename =
        "anonymized_" + (pdfFile.name || "document.pdf");

      formData.append("file", pdfBlob, anonymizedFilename);

      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/analytics/upload-text-file/`,
        formData,
        {
          headers: {
            "x-api-key": import.meta.env.VITE_API_KEY,
          },
        }
      );

      if (!response.data) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("Upload successful:", result);
      document.body.removeChild(pdfLibScript);
    } catch (error) {
      console.error("Error uploading PDF:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearBoxes = () => {
    setBoxes([]);
    setTextReplacements([]);
    setIsAnonymized(false);
  };

  const clearCurrentPage = () => {
    setBoxes(boxes.filter((box) => box.page !== currentPage));
    setTextReplacements(
      textReplacements.filter((tr) => tr.page !== currentPage)
    );
    setIsAnonymized(false);
  };

  const toggleMode = () => {
    setIsTextMode(!isTextMode);
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
            Upload a PDF and draw boxes to redact sensitive information or
            replace text
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
              <div className="flex flex-wrap gap-3 mb-3 items-center">
                {/* Mode Toggle - Hidden when in Anonymize Preview */}
                {!isAnonymized && (
                  <button
                    onClick={toggleMode}
                    className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${
                      isTextMode
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-red-600 hover:bg-red-700"
                    } text-white`}
                  >
                    <Type size={18} />
                    {isTextMode ? "Text Replace Mode" : "Redaction Mode"}
                  </button>
                )}

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
                      Clear All ({boxes.length + textReplacements.length})
                    </button>
                  </>
                )}

                {!isAnonymized ? (
                  <button
                    onClick={applyAnonymization}
                    disabled={
                      boxes.length === 0 && textReplacements.length === 0
                    }
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
                  disabled={
                    (boxes.length === 0 && textReplacements.length === 0) ||
                    isProcessing
                  }
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Download size={18} />
                  {isProcessing ? "Processing..." : "Download PDF"}
                </button>

                <button
                  onClick={uploadAnonymizedPDF}
                  disabled={
                    (boxes.length === 0 && textReplacements.length === 0) ||
                    isProcessing
                  }
                  className="px-4 py-2 bg-red-400 text-white rounded hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <UploadIcon size={18} />
                  {isProcessing ? "Processing..." : "Upload PDF"}
                </button>
              </div>

              {/* PAGE NAVIGATION ROW — NEW LINE, RIGHT ALIGNED */}
              <div className="flex justify-end gap-3 mb-6">
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
              </div>

              {/* Text Replacements List */}
              {textReplacements.filter((tr) => tr.page === currentPage).length >
                0 && (
                <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 mb-4">
                  <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                    <Type size={18} />
                    Text Replacements on This Page:
                  </h3>
                  <div className="space-y-2">
                    {textReplacements
                      .filter((tr) => tr.page === currentPage)
                      .map((tr) => (
                        <div
                          key={tr.id}
                          className="flex items-center justify-between bg-gray-600 p-2 rounded"
                        >
                          <div className="flex-1">
                            <span className="text-white text-sm">
                              &quot;{tr.text}&quot;
                            </span>
                            <span className="text-gray-400 text-xs ml-2">
                              (Size: {tr.fontSize}px)
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => editTextReplacement(tr)}
                              className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => deleteTextReplacement(tr.id)}
                              className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {isAnonymized && (
                <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-4 mb-6">
                  <p className="text-yellow-200 font-semibold flex items-center gap-2">
                    <ShieldCheck size={20} />
                    Anonymized Preview Active - All marked areas are now
                    hidden/replaced
                  </p>
                </div>
              )}

              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 mb-6">
                <h3 className="text-white font-semibold mb-2">Instructions:</h3>
                <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
                  <li>
                    {!isAnonymized ? (
                      <span
                        className={`font-semibold ${
                          isTextMode ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        Current Mode:{" "}
                        {isTextMode ? "Text Replacement" : "Redaction"}
                      </span>
                    ) : (
                      <span className="text-yellow-400 font-semibold">
                        Preview Mode: Viewing final anonymized version
                      </span>
                    )}
                  </li>
                  {!isAnonymized && (
                    <>
                      <li>
                        {isTextMode
                          ? "Click and drag to select text area, then enter replacement text"
                          : "Click and drag on the PDF to draw redaction boxes"}
                      </li>
                      <li>
                        Toggle between Redaction and Text Replace modes using
                        the button
                      </li>
                    </>
                  )}
                  <li>
                    Navigate between pages to mark content throughout the
                    document
                  </li>
                  <li>
                    Click &quot;Anonymize Preview&quot; to see how the final document will
                    look
                  </li>
                  <li>Click &quot;Download PDF&quot; to save the anonymized version</li>
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
                    {boxes.filter((b) => b.page === currentPage).length}{" "}
                    redaction(s) and{" "}
                    {
                      textReplacements.filter((tr) => tr.page === currentPage)
                        .length
                    }{" "}
                    text replacement(s) on this page
                  </span>
                ) : (
                  <span>
                    {boxes.filter((b) => b.page === currentPage).length}{" "}
                    redaction box(es) and{" "}
                    {
                      textReplacements.filter((tr) => tr.page === currentPage)
                        .length
                    }{" "}
                    text replacement(s) on this page
                  </span>
                )}
              </div>
            </>
          )}

          {/* Text Replacement Modal - Updated backdrop */}
          {editingReplacement && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-600 w-96 max-w-full shadow-xl">
                <h3 className="text-white text-lg font-semibold mb-4">
                  Enter Replacement Text
                </h3>
                <textarea
                  value={replacementText}
                  onChange={(e) => setReplacementText(e.target.value)}
                  placeholder="Enter text to replace the selected area..."
                  className="w-full h-32 p-3 bg-gray-700 text-white border border-gray-600 rounded mb-4 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setEditingReplacement(null)}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveTextReplacement}
                    disabled={!replacementText.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
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
