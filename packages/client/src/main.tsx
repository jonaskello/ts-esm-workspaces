import React from "react";
import ReactDOM from "react-dom";
import App from "./app";

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);

// HMR Code Snippet Example
if (undefined /* [snowpack] import.meta.hot */ ) {
  (undefined as any) /* [snowpack] import.meta.hot */ .accept(
    (m:any) => {
    // Accept the module, apply it into your application.
  });
}