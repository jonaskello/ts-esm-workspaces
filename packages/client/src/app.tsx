import React, { useState } from "react";
import { inc, appendMessage } from "@app/shared";

function App() {
  const [count, setCount] = useState(0);
  const x: string = "4";

  return (
    <div className="App">
      <header>
        <p>{appendMessage("Hello!")}</p>
        <p>
          <button type="button" onClick={() => setCount((count) => inc(count))}>
            count is: {count}
          </button>
        </p>
      </header>
    </div>
  );
}

export default App;
