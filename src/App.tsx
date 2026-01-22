// src/App.tsx
import { SalesScreen } from "./screens/SalesScreen";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
  return (
    <>
      <SalesScreen />

      {/* ✅ Toaster global */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        pauseOnHover
        draggable
        theme="light"
        limit={3}
      />
    </>
  );
}
