import React, { useState } from "react";
import { ArrowLeft, SendHorizontal } from "lucide-react";
import aiLogo from "../../../assets/brain.png";

const PROMPTS = [
  "What classes do I have left today?",
  "Where is my next lecture room?",
  "Show upcoming deadlines this week.",
];

const PLACEHOLDER_REPLY = "Sounds good, I'm not intelligent yet.";

function SearchArea({ value, onChange, onSubmit }) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[2rem] border border-[#d9ddd6] bg-white px-4 py-4 shadow-[0_-10px_30px_rgba(17,24,39,0.05)]"
    >
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder="Ask anything about your campus day..."
          className="flex-1 bg-transparent text-base text-[#111827] outline-none placeholder:text-[#7c7f78]"
        />
        <button
          type="submit"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#111827] text-white transition hover:bg-[#1f2937]"
          aria-label="Send message"
        >
          <SendHorizontal className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}

const CampusAi = ({ onClose }) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  const submitMessage = (nextValue = message) => {
    const trimmedValue = nextValue.trim();

    if (!trimmedValue) {
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: trimmedValue },
      { role: "assistant", content: PLACEHOLDER_REPLY },
    ]);
    setMessage("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submitMessage();
  };

  return (
    <div
      id="campus-ai-panel"
      className="fixed inset-0 z-[60] bg-white text-[#111827]"
    >
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-5 pb-4 pt-6">
          <div className="w-10" />
          <p className="text-base font-medium text-[#111827]">Campus AI</p>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#111827] transition hover:bg-[#f7f7f5]"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </header>

        <main className="flex flex-1 px-6 pb-44">
          {messages.length === 0 ? (
            <div className="flex w-full flex-col items-center justify-center text-center">
              <img
                src={aiLogo}
                alt="Campus AI"
                className="mb-6 h-16 w-16 rounded-full object-cover"
              />

              <h2 className="max-w-[12ch] font-serif text-5xl leading-[0.98] text-[#111827] sm:max-w-[14ch] sm:text-6xl">
                Ask anything about your campus day
              </h2>

              <p className="mt-4 max-w-sm text-sm leading-6 text-[#6b7280]">
                Check classes, deadlines, directions, and campus support from one place.
              </p>

              <div className="mt-8 flex w-full max-w-md flex-col gap-3">
                {PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submitMessage(prompt)}
                    className="rounded-full border border-[#d9ddd6] bg-white px-5 py-3 text-left text-sm text-[#374151] transition hover:border-[#c1c7bc] hover:bg-[#fbfbf9]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto py-6">
              {messages.map((entry, index) => (
                <div
                  key={`${entry.role}-${index}`}
                  className={`max-w-[85%] rounded-[1.75rem] px-5 py-4 text-sm leading-6 ${
                    entry.role === "user"
                      ? "self-end bg-[#111827] text-white"
                      : "self-start bg-[#f5f5f4] text-[#111827]"
                  }`}
                >
                  {entry.content}
                </div>
              ))}
            </div>
          )}
        </main>

        <div className="fixed inset-x-0 bottom-0 border-t border-[#e5e7eb] bg-white/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur">
          <div className="mx-auto w-full max-w-3xl">
            <SearchArea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampusAi;
