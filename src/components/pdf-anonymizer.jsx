import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Download,
  Trash2,
  Shield,
  ChevronLeft,
  ChevronRight,
  Edit3,
  X,
  FileText,
  Info,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
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

  // PDF toolbar state
  const [zoomLevel, setZoomLevel] = useState(100);
  const [pageInput, setPageInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]); // [{page, matches}]
  const [currentSearchIdx, setCurrentSearchIdx] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);

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

  // Render PDF page at high resolution for clarity (scale 2)
  // Visual size is controlled by CSS wrapper width, not canvas resolution
  const renderPage = async (pdf, pageNum) => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });

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
          // Text replacement: white background to cover old text, then overlay new text
          context.fillStyle = "rgba(255, 255, 255, 1)";
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
          // Text replacement: white background to cover old text
          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
            color: rgb(1, 1, 1),
          });

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

  const clearAllBoxes = () => {
    setBoxes([]);
  };

  const clearCurrentPageBoxes = () => {
    setBoxes(boxes.filter((box) => box.page !== currentPage));
  };

  // Zoom controls
  const handleZoom = (delta) => {
    setZoomLevel((prev) => {
      const next = Math.max(50, Math.min(200, prev + delta));
      return next;
    });
  };

  const resetZoom = () => setZoomLevel(100);

  // Go to specific page
  const handleGoToPage = (e) => {
    e.preventDefault();
    const page = parseInt(pageInput);
    if (page >= 1 && page <= totalPages) {
      changePage(page);
      setPageInput("");
    } else {
      toast.error(`Enter a page between 1 and ${totalPages}`, {
        position: "bottom-right",
      });
    }
  };

  // Search within PDF text
  const handleSearch = async () => {
    if (!searchText.trim() || !pdfDocRef.current) return;
    setIsSearching(true);
    setSearchResults([]);
    setCurrentSearchIdx(-1);

    const results = [];
    const query = searchText.trim().toLowerCase();

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDocRef.current.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      const lowerPageText = pageText.toLowerCase();

      let count = 0;
      let idx = lowerPageText.indexOf(query);
      while (idx !== -1) {
        count++;
        idx = lowerPageText.indexOf(query, idx + 1);
      }

      if (count > 0) {
        results.push({ page: i, matches: count });
      }
    }

    setSearchResults(results);
    setIsSearching(false);

    if (results.length > 0) {
      setCurrentSearchIdx(0);
      changePage(results[0].page);
      toast.success(
        `Found ${results.reduce((s, r) => s + r.matches, 0)} match(es) across ${results.length} page(s)`,
        { position: "bottom-right" }
      );
    } else {
      toast.info(`No results found for "${searchText.trim()}"`, {
        position: "bottom-right",
      });
    }
  };

  const navigateSearchResult = (direction) => {
    if (searchResults.length === 0) return;
    const nextIdx =
      (currentSearchIdx + direction + searchResults.length) %
      searchResults.length;
    setCurrentSearchIdx(nextIdx);
    changePage(searchResults[nextIdx].page);
  };

  const clearSearch = () => {
    setSearchText("");
    setSearchResults([]);
    setCurrentSearchIdx(-1);
    setShowSearchBar(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!pdfFile) return;

    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA"
      )
        return;

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        changePage(currentPage - 1);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        changePage(currentPage + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        changePage(1);
      } else if (e.key === "End") {
        e.preventDefault();
        changePage(totalPages);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearchBar((prev) => !prev);
      } else if (e.key === "+" || e.key === "=") {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleZoom(25);
        }
      } else if (e.key === "-") {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleZoom(-25);
        }
      } else if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pdfFile, currentPage, totalPages]);

  const [showAllAnnotations, setShowAllAnnotations] = useState(false);

  const currentPageBoxes = boxes.filter((b) => b.page === currentPage);
  const redactionCount = currentPageBoxes.filter((b) => !b.text).length;
  const replacementCount = currentPageBoxes.filter((b) => b.text).length;

  // Group all boxes by page for the all-annotations panel
  const boxesByPageGrouped = {};
  boxes.forEach((box) => {
    if (!boxesByPageGrouped[box.page]) boxesByPageGrouped[box.page] = [];
    boxesByPageGrouped[box.page].push(box);
  });

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <Shield className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Acurat
              </h1>
              <p className="text-xs text-slate-400">
                Tax Document Anonymizer
              </p>
            </div>
          </div>
          {pdfFile && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <FileText size={16} />
              <span className="truncate max-w-xs">{pdfFile.name}</span>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-4 flex-1 overflow-hidden w-full flex flex-col">
        {/* Upload area */}
        {!pdfFile && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-emerald-600 p-4 rounded-2xl mb-6">
              <Shield className="text-white" size={48} />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              Anonymize Your Tax Documents
            </h2>
            <p className="text-slate-400 mb-8 text-center max-w-md">
              Securely redact or replace sensitive information in your US tax
              documents before sharing.
            </p>
            <label className="flex flex-col items-center justify-center w-full max-w-lg h-44 border-2 border-slate-600 border-dashed rounded-xl cursor-pointer bg-slate-800/50 hover:bg-slate-800 hover:border-emerald-500/50 transition-all">
              <div className="flex flex-col items-center justify-center py-6">
                <Upload className="w-12 h-12 mb-4 text-emerald-500" />
                <p className="mb-2 text-sm text-slate-300">
                  <span className="font-semibold text-white">
                    Click to upload
                  </span>{" "}
                  or drag and drop your PDF
                </p>
                <p className="text-xs text-slate-500">
                  Supports all US tax forms (1040, W-2, 1099, etc.)
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                accept="application/pdf"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        )}

        {pdfFile && (
          <>
            {/* Upload new file option */}
            <div className="mb-3 flex-shrink-0">
              <label className="inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors border border-slate-700">
                <Upload size={16} />
                Upload different document
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                />
              </label>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
              {/* Sidebar */}
              <div className="flex flex-col w-full lg:w-60 flex-shrink-0 gap-3 overflow-y-auto">
                {/* Statistics */}
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Annotations
                  </h3>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Redactions</span>
                      <span className="text-white font-medium">
                        {redactionCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Replacements</span>
                      <span className="text-white font-medium">
                        {replacementCount}
                      </span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 flex justify-between">
                      <span className="text-slate-500 text-xs">
                        Total across all pages
                      </span>
                      <span className="text-slate-300 text-xs font-medium">
                        {boxes.length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Actions
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={clearCurrentPageBoxes}
                      disabled={currentPageBoxes.length === 0}
                      className="w-full px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2 justify-center text-sm"
                    >
                      <Trash2 size={16} />
                      Clear Page ({currentPageBoxes.length})
                    </button>

                    <button
                      onClick={clearAllBoxes}
                      disabled={boxes.length === 0}
                      className="w-full px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2 justify-center text-sm"
                    >
                      <Trash2 size={16} />
                      Clear All ({boxes.length})
                    </button>

                    <div className="border-t border-slate-700 pt-2">
                      <button
                        onClick={downloadPDF}
                        disabled={boxes.length === 0 || isProcessing}
                        className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors flex items-center gap-2 justify-center font-medium"
                      >
                        <Download size={18} />
                        {isProcessing
                          ? "Processing..."
                          : "Download Anonymized PDF"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Help */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
                  <div className="flex items-start gap-2">
                    <Info size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-slate-400 space-y-1.5">
                      <p>
                        Draw boxes on the document to mark areas for
                        anonymization.
                      </p>
                      <p>
                        <span className="text-red-400 font-medium">
                          Red border
                        </span>{" "}
                        = redacted (blacked out)
                      </p>
                      <p>
                        <span className="text-green-400 font-medium">
                          Green border
                        </span>{" "}
                        = replaced with your text
                      </p>
                      <div className="border-t border-slate-600/50 pt-1.5 mt-1.5">
                        <p className="text-slate-500 font-medium mb-1">
                          Keyboard shortcuts
                        </p>
                        <p>
                          <kbd className="bg-slate-700 px-1 rounded text-slate-300">
                            Ctrl+F
                          </kbd>{" "}
                          Search in PDF
                        </p>
                        <p>
                          <kbd className="bg-slate-700 px-1 rounded text-slate-300">
                            Ctrl +/-
                          </kbd>{" "}
                          Zoom in/out
                        </p>
                        <p>
                          <kbd className="bg-slate-700 px-1 rounded text-slate-300">
                            Ctrl+0
                          </kbd>{" "}
                          Reset zoom
                        </p>
                        <p>
                          <kbd className="bg-slate-700 px-1 rounded text-slate-300">
                            Arrow keys
                          </kbd>{" "}
                          Navigate pages
                        </p>
                        <p>
                          <kbd className="bg-slate-700 px-1 rounded text-slate-300">
                            Home/End
                          </kbd>{" "}
                          First/last page
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {/* Annotations panel */}
                {boxes.length > 0 && (
                  <div className="bg-slate-800 border border-slate-700 rounded-xl mb-2 flex-shrink-0">
                    {/* Tab buttons */}
                    <div className="flex border-b border-slate-700">
                      <button
                        onClick={() => setShowAllAnnotations(false)}
                        className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                          !showAllAnnotations
                            ? "text-white border-b-2 border-emerald-500"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Annotations in Current Page ({currentPageBoxes.length})
                      </button>
                      <button
                        onClick={() => setShowAllAnnotations(true)}
                        className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                          showAllAnnotations
                            ? "text-white border-b-2 border-emerald-500"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Annotations Across All Pages ({boxes.length})
                      </button>
                    </div>

                    <div className="p-3 max-h-48 overflow-y-auto">
                      {!showAllAnnotations ? (
                        /* Current page boxes */
                        currentPageBoxes.length > 0 ? (
                          <div className="space-y-2">
                            {currentPageBoxes.map((box, idx) => (
                              <div
                                key={box.id}
                                className="flex items-center justify-between bg-slate-700/50 p-2.5 rounded-lg border border-slate-600/50"
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="text-white text-sm">
                                    {box.text ? (
                                      <span className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                                        <span className="truncate">
                                          {box.text}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>
                                        Redaction #{idx + 1}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="flex gap-1.5 ml-2">
                                  <button
                                    onClick={() => editBox(box)}
                                    className="p-1.5 bg-slate-600 text-slate-300 rounded-md hover:bg-slate-500 hover:text-white transition-colors"
                                    title="Edit"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button
                                    onClick={() => deleteBox(box.id)}
                                    className="p-1.5 bg-slate-600 text-slate-300 rounded-md hover:bg-red-600 hover:text-white transition-colors"
                                    title="Delete"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-500 text-sm text-center py-3">
                            No annotations on this page. Draw a box to get
                            started.
                          </p>
                        )
                      ) : (
                        /* All pages boxes */
                        <div className="space-y-3">
                          {Object.entries(boxesByPageGrouped)
                            .sort(
                              ([a], [b]) => parseInt(a) - parseInt(b)
                            )
                            .map(([pageNum, pageBoxes]) => (
                              <div key={pageNum}>
                                <button
                                  onClick={() =>
                                    changePage(parseInt(pageNum))
                                  }
                                  className={`text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 hover:text-emerald-400 transition-colors ${
                                    parseInt(pageNum) === currentPage
                                      ? "text-emerald-400"
                                      : "text-slate-400"
                                  }`}
                                >
                                  Page {pageNum}
                                  <span className="text-slate-500 font-normal normal-case">
                                    — {pageBoxes.length} annotation
                                    {pageBoxes.length !== 1 ? "s" : ""}
                                  </span>
                                </button>
                                <div className="space-y-1.5">
                                  {pageBoxes.map((box, idx) => (
                                    <div
                                      key={box.id}
                                      className="flex items-center justify-between bg-slate-700/50 p-2 rounded-lg border border-slate-600/50"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <span className="text-white text-sm">
                                          {box.text ? (
                                            <span className="flex items-center gap-2">
                                              <span className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                                              <span className="truncate">
                                                {box.text}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="flex items-center gap-2">
                                              <span className="inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>
                                              Redaction #{idx + 1}
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                      <div className="flex gap-1.5 ml-2">
                                        <button
                                          onClick={() => editBox(box)}
                                          className="p-1.5 bg-slate-600 text-slate-300 rounded-md hover:bg-slate-500 hover:text-white transition-colors"
                                          title="Edit"
                                        >
                                          <Edit3 size={14} />
                                        </button>
                                        <button
                                          onClick={() =>
                                            deleteBox(box.id)
                                          }
                                          className="p-1.5 bg-slate-600 text-slate-300 rounded-md hover:bg-red-600 hover:text-white transition-colors"
                                          title="Delete"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* PDF Toolbar */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-2 mb-2 flex items-center gap-2 flex-wrap flex-shrink-0">
                  {/* Page navigation */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => changePage(1)}
                      disabled={currentPage === 1}
                      className="p-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="First page (Home)"
                    >
                      <ChevronsLeft size={16} />
                    </button>
                    <button
                      onClick={() => changePage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <form
                      onSubmit={handleGoToPage}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        placeholder={String(currentPage)}
                        className="w-12 text-center text-sm bg-slate-900 text-white border border-slate-600 rounded-md py-1 px-1 focus:ring-1 focus:ring-emerald-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-slate-400 text-sm">
                        / {totalPages}
                      </span>
                    </form>

                    <button
                      onClick={() => changePage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => changePage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="p-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Last page (End)"
                    >
                      <ChevronsRight size={16} />
                    </button>
                  </div>

                  <div className="w-px h-6 bg-slate-600"></div>

                  {/* Zoom controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleZoom(-25)}
                      disabled={zoomLevel <= 50}
                      className="p-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Zoom out (Ctrl+-)"
                    >
                      <ZoomOut size={16} />
                    </button>
                    <span className="text-sm text-slate-300 font-medium w-12 text-center">
                      {zoomLevel}%
                    </span>
                    <button
                      onClick={() => handleZoom(25)}
                      disabled={zoomLevel >= 200}
                      className="p-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Zoom in (Ctrl++)"
                    >
                      <ZoomIn size={16} />
                    </button>
                    <button
                      onClick={resetZoom}
                      disabled={zoomLevel === 100}
                      className="p-1.5 bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 hover:text-white disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                      title="Reset zoom (Ctrl+0)"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>

                  <div className="w-px h-6 bg-slate-600"></div>

                  {/* Search toggle */}
                  <button
                    onClick={() => setShowSearchBar((prev) => !prev)}
                    className={`p-1.5 rounded-md transition-colors ${
                      showSearchBar
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
                    }`}
                    title="Search in PDF (Ctrl+F)"
                  >
                    <Search size={16} />
                  </button>
                </div>

                {/* Search bar */}
                {showSearchBar && (
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 mb-2 flex items-center gap-2">
                    <Search size={16} className="text-slate-400 flex-shrink-0" />
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSearch();
                      }}
                      className="flex-1 flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Search text in PDF..."
                        className="flex-1 text-sm bg-slate-900 text-white border border-slate-600 rounded-lg py-1.5 px-3 focus:ring-1 focus:ring-emerald-500 focus:border-transparent placeholder-slate-500"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!searchText.trim() || isSearching}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSearching ? "Searching..." : "Find"}
                      </button>
                    </form>

                    {searchResults.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          Page {currentSearchIdx + 1} of{" "}
                          {searchResults.length}
                        </span>
                        <button
                          onClick={() => navigateSearchResult(-1)}
                          className="p-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 hover:text-white transition-colors"
                          title="Previous result"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          onClick={() => navigateSearchResult(1)}
                          className="p-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 hover:text-white transition-colors"
                          title="Next result"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}

                    <button
                      onClick={clearSearch}
                      className="p-1.5 text-slate-400 hover:text-white transition-colors"
                      title="Close search"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* PDF viewer — full width, fills remaining space */}
                <div
                  ref={containerRef}
                  className="border border-slate-700 rounded-xl overflow-auto bg-slate-950 flex-1 min-h-0 p-2"
                >
                  <div
                    style={{
                      position: "relative",
                      width: `${zoomLevel}%`,
                      maxWidth: zoomLevel <= 100 ? "100%" : "none",
                      margin: "0 auto",
                    }}
                  >
                    <canvas
                      ref={canvasRef}
                      className="rounded"
                      style={{
                        width: "100%",
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
                      className="cursor-crosshair"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 flex-shrink-0">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Powered by Acurat
          </p>
          <p className="text-xs text-slate-600">
            All processing happens locally in your browser. No data is sent to
            any server.
          </p>
        </div>
      </footer>

      {/* Text Replacement Modal */}
      {editingBox && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-600 w-96 max-w-full shadow-2xl">
            <h3 className="text-white text-lg font-semibold mb-1">
              {editingBox.isEditing ? "Edit Annotation" : "Add Annotation"}
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              Enter replacement text, or leave empty to fully redact the
              selected area.
            </p>
            <textarea
              value={replacementText}
              onChange={(e) => setReplacementText(e.target.value)}
              placeholder="Enter replacement text (leave empty to redact)..."
              className="w-full h-28 p-3 bg-slate-900 text-white border border-slate-600 rounded-lg mb-4 resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder-slate-500"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setEditingBox(null);
                  setReplacementText("");
                }}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveBox}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                {replacementText.trim() ? "Save Replacement" : "Save Redaction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
