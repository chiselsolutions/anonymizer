import { ToastContainer } from "react-toastify";
import "./App.css";
// import PDFAnonymizer from "./components/test";
import PDFAnonymizer from "./components/pdf-anonymizer";

function App() {
  return (
    <>
      <PDFAnonymizer />
      <ToastContainer autoClose={2000}/>
    </>
  );
}

export default App;
