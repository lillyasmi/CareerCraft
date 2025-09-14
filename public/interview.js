const roleSelect = document.getElementById("role-select");
const typeSelect = document.getElementById("type-select");
const difficultySelect = document.getElementById("difficulty-select"); 
const startBtn = document.getElementById("start-interview-btn");
const chatBox = document.getElementById("interview-chat");
const answerInput = document.getElementById("answer-input");
const submitBtn = document.getElementById("submit-answer-btn");
const summaryBox = document.getElementById("interview-summary");
const summaryContent = document.getElementById("summary-content");

// Interview state management
let currentQuestion = "";
let currentSessionId = "";
let currentQuestionNumber = 0;
let totalQuestions = 5;
let interviewHistory = [];
let isInterviewActive = false;

// Escape HTML helper
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Append message to chat
function addMessage(text, sender = "ai") {
  const msg = document.createElement("div");
  msg.className = sender === "ai" ? "ai-msg" : "user-msg";
  msg.innerHTML = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Add progress indicator
function updateProgress() {
  const existingProgress = document.querySelector('.progress-indicator');
  if (existingProgress) {
    existingProgress.remove();
  }
  
  if (isInterviewActive && currentQuestionNumber > 0) {
    const progressDiv = document.createElement("div");
    progressDiv.className = "progress-indicator";
    progressDiv.style.cssText = `
      background: #1e1e1e; 
      padding: 10px; 
      margin: 10px 0; 
      border-radius: 8px; 
      text-align: center; 
      color: #00c6ff;
      border: 1px solid #333;
    `;
    progressDiv.innerHTML = `📋 Question ${currentQuestionNumber} of ${totalQuestions}`;
    chatBox.appendChild(progressDiv);
  }
}

// --------------------
// Start Interview
// --------------------
startBtn.addEventListener("click", async () => {
  // Reset everything
  chatBox.innerHTML = ""; 
  summaryBox.style.display = "none";
  interviewHistory = [];
  currentSessionId = "";
  currentQuestionNumber = 0;
  isInterviewActive = true;

  const role = roleSelect.value;
  const type = typeSelect.value;
  const difficulty = difficultySelect?.value || "medium";

  addMessage("🎤 Starting your interview... Please wait while I prepare the first question.", "ai");

  // Disable start button during interview
  startBtn.disabled = true;
  startBtn.textContent = "Interview in Progress...";

  try {
    const res = await fetch("/api/start-interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, type, difficulty }),
    });

    const data = await res.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    currentQuestion = data.question;
    currentSessionId = data.sessionId;
    currentQuestionNumber = data.questionNumber || 1;
    totalQuestions = data.totalQuestions || 5;

    updateProgress();
    addMessage(`🤖 <strong>Question ${currentQuestionNumber}:</strong><br>${escapeHtml(currentQuestion)}`, "ai");
    
    // Enable answer input
    answerInput.disabled = false;
    submitBtn.disabled = false;
    answerInput.focus();

  } catch (err) {
    console.error("Start interview error:", err);
    addMessage("⚠️ Failed to start interview: " + err.message, "ai");
    resetInterviewState();
  }
});

// --------------------
// Submit Answer
// --------------------
submitBtn.addEventListener("click", async () => {
  const answer = answerInput.value.trim();
  if (!answer) {
    alert("Please type your answer before submitting.");
    answerInput.focus();
    return;
  }

  if (!currentQuestion || !isInterviewActive) {
    addMessage("⚠️ No active question. Please start the interview first.", "ai");
    return;
  }

  // Display user's answer
  addMessage(`💬 <strong>Your Answer:</strong><br>${escapeHtml(answer)}`, "user");
  answerInput.value = "";
  answerInput.disabled = true;
  submitBtn.disabled = true;

  addMessage("🤔 Evaluating your answer...", "ai");

  try {
    const role = roleSelect.value;
    const type = typeSelect.value;

    // Evaluate the current answer
    const evalRes = await fetch("/api/evaluate-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        question: currentQuestion, 
        answer, 
        role, 
        type, 
        sessionId: currentSessionId,
        questionNumber: currentQuestionNumber
      }),
    });

    const evalData = await evalRes.json();

    // Store in history
    interviewHistory.push({
      questionNumber: currentQuestionNumber,
      question: currentQuestion,
      answer: answer,
      feedback: evalData.feedback || [],
      idealAnswer: evalData.idealAnswer || "",
      score: evalData.score || 5,
      strengths: evalData.strengths || [],
      improvements: evalData.improvements || []
    });

    // Display feedback
    const feedbackHtml = Array.isArray(evalData.feedback) && evalData.feedback.length
      ? `<ul>${evalData.feedback.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
      : "<p>No specific feedback available.</p>";

    const score = evalData.score ? `<strong>📊 Score:</strong> ${evalData.score}/10<br>` : '';
    
    addMessage(`<div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <strong>📋 Feedback:</strong><br>${feedbackHtml}
                ${score}
                <strong>✅ Ideal Answer:</strong><br>
                <p style="background: #0a2a0a; padding: 10px; border-radius: 5px; border-left: 3px solid #00ff00;">
                ${escapeHtml(evalData.idealAnswer)}
                </p>
                </div>`, "ai");

    // Check if interview is complete
    if (currentQuestionNumber >= totalQuestions) {
      addMessage("🎉 Interview completed! Generating your comprehensive summary...", "ai");
      await generateInterviewSummary();
      return;
    }

    // Get next question
    setTimeout(async () => {
      try {
        const nextRes = await fetch("/api/start-interview", {
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            role, 
            type, 
            difficulty: difficultySelect?.value || "medium",
            sessionId: currentSessionId
          }),
        });

        const nextData = await nextRes.json();

        if (nextData.completed) {
          addMessage("🎉 Interview completed! Generating your summary...", "ai");
          await generateInterviewSummary();
          return;
        }

        currentQuestion = nextData.question;
        currentQuestionNumber = nextData.questionNumber || (currentQuestionNumber + 1);

        updateProgress();
        addMessage(`🤖 <strong>Question ${currentQuestionNumber}:</strong><br>${escapeHtml(currentQuestion)}`, "ai");
        
        // Re-enable input for next question
        answerInput.disabled = false;
        submitBtn.disabled = false;
        answerInput.focus();

      } catch (nextErr) {
        console.error("Next question error:", nextErr);
        addMessage("⚠️ Error getting next question. Interview completed.", "ai");
        await generateInterviewSummary();
      }
    }, 2000); // Short delay before next question

  } catch (err) {
    console.error("Submit answer error:", err);
    addMessage("⚠️ Error evaluating answer: " + err.message, "ai");
    // Re-enable inputs on error
    answerInput.disabled = false;
    submitBtn.disabled = false;
  }
});

// --------------------
// Generate Interview Summary
// --------------------
async function generateInterviewSummary() {
  isInterviewActive = false;
  answerInput.disabled = true;
  submitBtn.disabled = true;

  try {
    const summaryRes = await fetch("/api/interview-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId }),
    });

    const summaryData = await summaryRes.json();

    if (summaryData.error) {
      throw new Error(summaryData.error);
    }

    displayInterviewSummary(summaryData);

  } catch (err) {
    console.error("Summary generation error:", err);
    // Show basic summary on error
    displayBasicSummary();
  }

  resetInterviewState();
}

// --------------------
// Display Interview Summary
// --------------------
function displayInterviewSummary(summaryData) {
  summaryBox.style.display = "block";
  
  const session = summaryData.sessionDetails || {};
  const avgScore = session.averageScore || 0;
  
  let summaryHtml = `
    <div style="background: #1e1e1e; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
      <h3 style="color: #00c6ff; margin-top: 0;">🎯 Interview Performance Summary</h3>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
        <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 24px; color: #00c6ff;">${avgScore}/10</div>
          <div style="color: #ccc;">Average Score</div>
        </div>
        <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 24px; color: #00c6ff;">${session.questionsAnswered || 0}</div>
          <div style="color: #ccc;">Questions</div>
        </div>
        <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 24px; color: #00c6ff;">${session.duration || 0}m</div>
          <div style="color: #ccc;">Duration</div>
        </div>
      </div>

      <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <strong style="color: #00ff00;">Overall Rating:</strong> ${summaryData.overallRating || 'Good'}
      </div>

      <div style="background: #2a2a2a; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <strong style="color: #ccc;">Summary:</strong><br>
        <p style="margin: 10px 0;">${escapeHtml(summaryData.summary || 'Interview completed successfully.')}</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">
      <div style="background: #1a2a1a; padding: 15px; border-radius: 8px; border-left: 4px solid #00ff00;">
        <strong style="color: #00ff00;">✅ Key Strengths:</strong>
        <ul>${(summaryData.keyStrengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>Completed all questions</li>'}</ul>
      </div>
      
      <div style="background: #2a1a1a; padding: 15px; border-radius: 8px; border-left: 4px solid #ff6b6b;">
        <strong style="color: #ff6b6b;">🎯 Areas for Improvement:</strong>
        <ul>${(summaryData.areasForImprovement || []).map(a => `<li>${escapeHtml(a)}</li>`).join('') || '<li>Continue practicing</li>'}</ul>
      </div>
    </div>

    <div style="background: #1e1e1e; padding: 15px; border-radius: 8px; margin: 15px 0;">
      <strong style="color: #00c6ff;">💼 Recommendation:</strong><br>
      <p style="margin: 10px 0;">${escapeHtml(summaryData.recommendation || 'Keep practicing and improving your interview skills.')}</p>
    </div>
  `;

  // Add detailed question breakdown
  if (interviewHistory.length > 0) {
    summaryHtml += `
      <details style="margin: 20px 0;">
        <summary style="cursor: pointer; color: #00c6ff; font-weight: bold; padding: 10px; background: #2a2a2a; border-radius: 8px;">
          📋 Detailed Question Analysis (Click to expand)
        </summary>
        <div style="margin-top: 15px;">
    `;
    
    interviewHistory.forEach((item, index) => {
      summaryHtml += `
        <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 3px solid #00c6ff;">
          <strong>Question ${item.questionNumber}:</strong> ${escapeHtml(item.question)}<br>
          <strong>Your Answer:</strong> ${escapeHtml(item.answer)}<br>
          <strong>Score:</strong> ${item.score}/10<br>
          <strong>Feedback:</strong>
          <ul>${item.feedback.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
        </div>
      `;
    });
    
    summaryHtml += `</div></details>`;
  }

  summaryContent.innerHTML = summaryHtml;
}

function displayBasicSummary() {
  summaryBox.style.display = "block";
  
  const totalScore = interviewHistory.reduce((sum, item) => sum + (item.score || 5), 0);
  const avgScore = interviewHistory.length > 0 ? Math.round(totalScore / interviewHistory.length * 10) / 10 : 0;
  
  let summaryHtml = `
    <div style="background: #1e1e1e; padding: 20px; border-radius: 12px;">
      <h3 style="color: #00c6ff; margin-top: 0;">📋 Interview Summary</h3>
      <p><strong>Questions Answered:</strong> ${interviewHistory.length}</p>
      <p><strong>Average Score:</strong> ${avgScore}/10</p>
      <p><strong>Overall Performance:</strong> ${avgScore >= 8 ? 'Excellent' : avgScore >= 6 ? 'Good' : 'Needs Improvement'}</p>
    </div>
  `;

  interviewHistory.forEach((item, index) => {
    summaryHtml += `
      <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <strong>Q${index + 1}:</strong> ${escapeHtml(item.question)}<br>
        <strong>Your Answer:</strong> ${escapeHtml(item.answer)}<br>
        <strong>Score:</strong> ${item.score}/10
      </div>
    `;
  });

  summaryContent.innerHTML = summaryHtml;
}

// Reset interview state
function resetInterviewState() {
  startBtn.disabled = false;
  startBtn.textContent = "🎤 Start Interview";
  answerInput.disabled = true;
  submitBtn.disabled = true;
  answerInput.value = "";
  isInterviewActive = false;
  
  const progressIndicator = document.querySelector('.progress-indicator');
  if (progressIndicator) {
    progressIndicator.remove();
  }
}

// Enter key support for answer input
answerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey && !submitBtn.disabled) {
    submitBtn.click();
  }
});

// Additional keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Alt + S to start/restart interview
  if (e.key === "s" && e.altKey && !startBtn.disabled) {
    e.preventDefault();
    startBtn.click();
  }
  
  // Escape key to focus on answer input
  if (e.key === "Escape" && !answerInput.disabled) {
    answerInput.focus();
  }
});

// Auto-resize textarea based on content
answerInput.addEventListener("input", () => {
  answerInput.style.height = "auto";
  answerInput.style.height = Math.min(answerInput.scrollHeight, 200) + "px";
});

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  // Set initial state
  resetInterviewState();
  
  // Add helpful tooltip or initial message
  addMessage("👋 Welcome to the Interview Simulator! Select your role, interview type, and difficulty level, then click 'Start Interview' to begin.", "ai");
  
  console.log("Interview application initialized successfully!");
});

// Handle page visibility change (pause/resume functionality)
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isInterviewActive) {
    console.log("Interview paused - tab hidden");
  } else if (!document.hidden && isInterviewActive) {
    console.log("Interview resumed - tab visible");
    // Could add logic here to resume timers or refresh state
  }
});

// Error handling for uncaught errors
window.addEventListener("error", (e) => {
  console.error("Application error:", e.error);
  if (isInterviewActive) {
    addMessage("⚠️ An unexpected error occurred. Please try restarting the interview.", "ai");
  }
});

// Handle network connectivity issues
window.addEventListener("online", () => {
  if (isInterviewActive) {
    addMessage("✅ Connection restored.", "ai");
  }
});

window.addEventListener("offline", () => {
  if (isInterviewActive) {
    addMessage("⚠️ Connection lost. Please check your internet connection.", "ai");
  }
});