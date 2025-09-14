// server.js (fixed — minimal changes)
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs"); // ← single import (no duplicate)
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


const app = express();
app.use(cors());

// parse JSON once with larger limit and urlencoded once
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// --- Separate Gemini clients (you already set these env vars) ---
const genAI_resume = new GoogleGenerativeAI(process.env.RESUME_API_KEY);
const genAI_interview = new GoogleGenerativeAI(process.env.INTERVIEW_API_KEY);
const genAI_trends = new GoogleGenerativeAI(process.env.TRENDS_API_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// -------------------
// General / simple generate endpoint (uses genAI_resume in your code)
// -------------------
app.post("/api/generate", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    // kept your existing client usage (genAI_resume) — do change to another client if needed
    const model = genAI_resume.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ No response from Gemini.";

    res.json({ text });
  } catch (err) {
    console.error("Gemini Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// -------------------
// AI Resume Parser (uses genAI_resume)
// -------------------
app.post("/api/parse-resume", async (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "No resume text provided" });

    const prompt = `You are an expert resume parser. 
Convert the following RESUME TEXT into a strict JSON object only (no explanation).
Output MUST be valid JSON and nothing else. Use this schema:
{
  "personal": { "name": "", "email": "", "phone": "", "location": "" },
  "summary": "<one-line profile summary>",
  "education": [
    { "degree":"", "institution":"", "start":"", "end":"", "details":"" }
  ],
  "skills": ["skill1","skill2"],
  "experience": [
    { "title":"", "company":"", "start":"", "end":"", "bullets":["..."] }
  ],
  "projects": [
    { "name":"", "description":"", "tech":["..."], "link":"" }
  ]
}
Resume text:
\"\"\"${text}\"\"\"`;

    const model = genAI_resume.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0,
      maxOutputTokens: 800,
    });

    const aiText =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    let parsed = null;
    try {
      parsed = JSON.parse(aiText);
    } catch {
      const jsonMatch = aiText.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[1]); } catch {}
      }
    }

    if (!parsed) {
      return res.json({ error: "parse_failed", raw: aiText });
    }

    return res.json({ parsed });
  } catch (err) {
    console.error("parse-resume error:", err.message);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

// -------------------
// Mock Interview APIs (uses genAI_interview) - IMPROVED VERSION
// -------------------

// In-memory storage for interview sessions (use Redis/DB in production)
const interviewSessions = new Map();

// Generate unique session ID
function generateSessionId() {
  return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Start Interview -> first question with session tracking
app.post("/api/start-interview", async (req, res) => {
  const { role, type, difficulty, sessionId } = req.body;
  if (!role || !type) return res.status(400).json({ error: "Missing role/type" });

  try {
    let currentSessionId = sessionId;
    let questionCount = 1;
    let previousQuestions = [];

    // If no session ID, create new session
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
      interviewSessions.set(currentSessionId, {
        role,
        type,
        difficulty: difficulty || "medium",
        questions: [],
        answers: [],
        questionCount: 0,
        startTime: new Date()
      });
    } else {
      // Get existing session
      const session = interviewSessions.get(currentSessionId);
      if (session) {
        questionCount = session.questionCount + 1;
        previousQuestions = session.questions;
      }
    }

    // Check if we've reached the limit
    if (questionCount > 5) {
      return res.json({ 
        question: null, 
        sessionId: currentSessionId, 
        completed: true,
        message: "Interview completed! 5 questions answered." 
      });
    }

    const questionTypes = {
      1: "introduction and background",
      2: "technical skills and experience", 
      3: "problem-solving scenario",
      4: "behavioral situation",
      5: "future goals and company fit"
    };

    const previousQuestionsText = previousQuestions.length > 0 
      ? `\n\nPrevious questions asked: ${previousQuestions.join('; ')}\n\nMake sure this question is COMPLETELY DIFFERENT from previous ones.`
      : '';

    const prompt = `You are conducting a professional interview. This is question ${questionCount} of 5.

Role: ${role}
Interview type: ${type}
Difficulty: ${difficulty || "medium"}
Question focus: ${questionTypes[questionCount]}

Ask a ${questionTypes[questionCount]} question suitable for a ${role} position.
Make it specific, relevant, and ${difficulty} level difficulty.${previousQuestionsText}

Only output the QUESTION, nothing else.`;

    const model = genAI_interview.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0.8, // Higher temperature for more variety
    });

    const question =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      fallbackInterviewQuestion(role, type, difficulty, questionCount);

    // Update session
    const session = interviewSessions.get(currentSessionId);
    if (session) {
      session.questions.push(question);
      session.questionCount = questionCount;
    }

    res.json({ 
      question, 
      sessionId: currentSessionId, 
      questionNumber: questionCount,
      totalQuestions: 5,
      completed: false
    });

  } catch (err) {
    console.error("start-interview error:", err.message);
    const fallbackQ = fallbackInterviewQuestion(role, type, difficulty, questionCount);
    res.json({ 
      question: fallbackQ, 
      sessionId: currentSessionId || generateSessionId(), 
      questionNumber: questionCount,
      fallback: true 
    });
  }
});

// Evaluate Answer -> feedback + unique ideal answer
app.post("/api/evaluate-answer", async (req, res) => {
  const { question, answer, role, type, sessionId, questionNumber } = req.body;
  if (!question || !answer) return res.status(400).json({ error: "Missing Q/A" });

  try {
    const prompt = `You are an expert interviewer providing detailed feedback.

Role: ${role}
Interview type: ${type}  
Question #${questionNumber}: "${question}"
Candidate Answer: "${answer}"

Provide specific, actionable feedback and a unique ideal answer for THIS SPECIFIC question.

Respond ONLY in JSON format:
{
  "feedback": [
    "specific feedback point about their answer",
    "what they did well or could improve",
    "suggestions for better answering"
  ],
  "idealAnswer": "A comprehensive ideal answer specifically for this question, showing what a strong candidate would say",
  "score": 7,
  "strengths": ["strength1", "strength2"], 
  "improvements": ["area1", "area2"]
}`;

    const model = genAI_interview.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0.3,
      maxOutputTokens: 800,
    });

    const raw = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (e2) {
          parsed = null;
        }
      }
    }

    if (!parsed) {
      parsed = fallbackEvaluateAnswer(question, answer, role, questionNumber);
    }

    // Store answer in session
    if (sessionId && interviewSessions.has(sessionId)) {
      const session = interviewSessions.get(sessionId);
      session.answers.push({
        question,
        answer,
        feedback: parsed.feedback,
        idealAnswer: parsed.idealAnswer,
        score: parsed.score || 5,
        strengths: parsed.strengths || [],
        improvements: parsed.improvements || []
      });
    }

    // Ensure proper format
    const response = {
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [parsed.feedback || "Good effort on your answer."],
      idealAnswer: parsed.idealAnswer || `An ideal answer would provide specific examples and demonstrate your experience with ${role} responsibilities.`,
      score: parsed.score || 5,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : []
    };

    return res.json(response);

  } catch (err) {
    console.error("evaluate-answer error:", err);
    const fb = fallbackEvaluateAnswer(question, answer, role, questionNumber);
    return res.json({ ...fb, error: err.message, fallback: true });
  }
});

// Generate Interview Summary
app.post("/api/interview-summary", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || !interviewSessions.has(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  try {
    const session = interviewSessions.get(sessionId);
    const { role, type, answers, startTime } = session;

    // Calculate metrics
    const totalScore = answers.reduce((sum, a) => sum + (a.score || 5), 0);
    const averageScore = Math.round(totalScore / answers.length * 10) / 10;
    const duration = Math.round((new Date() - startTime) / 1000 / 60); // minutes

    // Generate AI summary
    const prompt = `Generate a comprehensive interview summary for a ${role} candidate.

Interview Details:
- Role: ${role}
- Type: ${type}  
- Duration: ${duration} minutes
- Questions: ${answers.length}
- Average Score: ${averageScore}/10

Candidate Performance:
${answers.map((a, i) => `
Q${i+1}: ${a.question}
Answer: ${a.answer}
Score: ${a.score}/10
Strengths: ${a.strengths.join(', ')}
Improvements: ${a.improvements.join(', ')}
`).join('\n')}

Provide a JSON response with:
{
  "overallRating": "Excellent/Good/Average/Needs Improvement",
  "summary": "2-3 sentence overall assessment",
  "keyStrengths": ["strength1", "strength2", "strength3"],
  "areasForImprovement": ["area1", "area2", "area3"], 
  "recommendation": "Hire/Consider/Pass recommendation with reasoning",
  "nextSteps": ["next step suggestions"]
}`;

    const model = genAI_interview.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0.2,
    });

    const raw = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    
    let aiSummary = null;
    try {
      aiSummary = JSON.parse(raw);
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          aiSummary = JSON.parse(match[0]);
        } catch (e2) {}
      }
    }

    // Fallback summary if AI fails
    if (!aiSummary) {
      aiSummary = {
        overallRating: averageScore >= 8 ? "Excellent" : averageScore >= 6 ? "Good" : averageScore >= 4 ? "Average" : "Needs Improvement",
        summary: `Candidate completed a ${answers.length}-question ${type} interview for ${role} position with an average score of ${averageScore}/10.`,
        keyStrengths: session.answers.flatMap(a => a.strengths).slice(0, 3),
        areasForImprovement: session.answers.flatMap(a => a.improvements).slice(0, 3),
        recommendation: averageScore >= 7 ? "Consider for next round" : "Additional evaluation needed",
        nextSteps: ["Review technical skills", "Conduct team interview", "Check references"]
      };
    }

    const fullSummary = {
      ...aiSummary,
      sessionDetails: {
        role,
        type, 
        duration,
        questionsAnswered: answers.length,
        averageScore,
        startTime: startTime.toISOString()
      },
      questionDetails: answers.map((a, i) => ({
        questionNumber: i + 1,
        question: a.question,
        answer: a.answer,
        score: a.score,
        feedback: a.feedback
      }))
    };

    // Clean up session after summary
    setTimeout(() => {
      interviewSessions.delete(sessionId);
    }, 300000); // Delete after 5 minutes

    res.json(fullSummary);

  } catch (err) {
    console.error("interview-summary error:", err);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// --- Enhanced Fallback Functions ---
function fallbackInterviewQuestion(role, type, difficulty, questionNumber = 1) {
  const questions = {
    1: `Tell me about yourself and what interests you about this ${role} position.`,
    2: `What technical skills and experience do you have that make you suitable for this ${role} role?`,
    3: `Describe a challenging problem you've solved in your previous work. How did you approach it?`,
    4: `Tell me about a time when you had to work under pressure or meet a tight deadline.`,
    5: `Where do you see yourself in 5 years, and how does this ${role} position fit your career goals?`
  };
  
  return questions[questionNumber] || `What motivated you to pursue a career as a ${role}?`;
}

function fallbackEvaluateAnswer(question, answer, role, questionNumber = 1) {
  const specificFeedback = {
    1: [`Good introduction, but try to be more specific about your relevant experience.`, `Connect your background more directly to the ${role} requirements.`],
    2: [`Provide more concrete examples of your technical skills in action.`, `Quantify your experience with specific projects or achievements.`],
    3: [`Great problem-solving example! Consider adding more detail about your thought process.`, `Explain the impact or results of your solution.`],
    4: [`Good example of working under pressure. Add more details about time management strategies.`, `Describe what you learned from this experience.`],
    5: [`Clear career goals. Better align them with this specific ${role} opportunity.`, `Show more research about the company and role.`]
  };

  return {
    feedback: specificFeedback[questionNumber] || [`You provided a thoughtful answer.`, `For a ${role} position, try to include more specific examples.`],
    idealAnswer: `An ideal answer to "${question}" would provide specific examples, quantifiable results, and demonstrate clear alignment with ${role} responsibilities and requirements.`,
    score: Math.floor(Math.random() * 3) + 5, // 5-7 range for fallback
    strengths: ["Clear communication", "Relevant experience"],
    improvements: ["More specific examples", "Better structure"]
  };
}
// -------------------
// Industry Trends API (uses genAI_trends)
// -------------------
app.post("/api/trends", async (req, res) => {
  const { topic } = req.body;
  console.log("🔥 /api/trends hit with topic:", topic);

  res.setHeader("Content-Type", "application/json");

  if (!topic || typeof topic !== "string") {
    return res.status(400).json({ error: "Missing or invalid topic/technology" });
  }

  try {
    const prompt = `
You are a senior industry analyst and career advisor. Provide a comprehensive, detailed analysis for: "${topic}".

CRITICAL: Respond ONLY with valid JSON. No markdown, no code blocks, no explanations.

Return this exact JSON structure:
{
  "overview": "4-5 sentence overview of ${topic}",
  "roadmap": "step-by-step learning path",
  "certifications": ["cert1", "cert2"],
  "skills": [
    {"name": "Skill 1", "demand": 90},
    {"name": "Skill 2", "demand": 80}
  ],
  "jobs": "roles with salary ranges",
  "news": ["news1", "news2"],
  "advice": "career advice",
  "marketSize": "market size info",
  "growth": "growth rate",
  "jobGrowth": "job growth outlook",
  "keyTakeaways": ["point1", "point2"]
}
    `;

    if (!genAI_trends) throw new Error("Gemini not configured (missing API key)");

    const model = genAI_trends.getGenerativeModel({ model: "gemini-1.5-flash" });
    // ← use the contents shape (consistent with other calls)
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0.2,
      maxOutputTokens: 2000
    });

    let aiText = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!aiText) throw new Error("Empty response from Gemini");

    aiText = aiText.replace(/```json|```/g, "").trim();
    let parsed = null;
    try {
      parsed = JSON.parse(aiText);
    } catch {
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }

    if (!parsed) {
      console.log("❌ Parsing failed → fallback used");
      parsed = createEnhancedFallbackResponse(topic);
    }

    parsed = validateAndEnhanceResponse(parsed, topic);
    res.json(parsed);
  } catch (err) {
    console.error("Backend trends error:", err.message);
    res.status(500).json({
      error: `Gemini API failed → fallback mode: ${err.message}`,
      ...createEnhancedFallbackResponse(topic),
    });
  }
});

// -------------------
// Fallback Generator
// -------------------
function createEnhancedFallbackResponse(topic) {
  return {
    overview: `The ${topic} industry is growing rapidly with strong adoption across multiple sectors. Demand for skilled professionals continues to rise as businesses seek innovation in ${topic}.`,
    roadmap: `1. Foundations → 2. Intermediate Tools → 3. Advanced Projects → 4. Specialization`,
    certifications: [
      `${topic} Professional Certificate`,
      `Advanced ${topic} Specialist`,
      `Cloud ${topic} Certification`,
    ],
    skills: [
      { name: `${topic} Fundamentals`, demand: 90 },
      { name: "System Design", demand: 85 },
      { name: "Data Analysis", demand: 80 },
      { name: "Problem Solving", demand: 75 },
    ],
    jobs: `Entry: ${topic} Developer ($65k–$90k), Mid: ${topic} Engineer ($90k–$130k), Senior: ${topic} Architect ($120k–$180k)`,
    news: [
      `${topic} adoption is accelerating globally`,
      `Investments in ${topic} startups reached record highs`,
    ],
    advice: `Build strong fundamentals in ${topic}, work on real projects, and stay updated with new frameworks.`,
    marketSize: "$40+ billion, CAGR ~20%",
    growth: "20% annual growth",
    jobGrowth: "Projected 30% job growth over 5 years",
    keyTakeaways: [
      `${topic} skills are in high demand`,
      "Practical projects matter more than theory",
      "Certifications help but portfolios win jobs",
    ],
  };
}

function validateAndEnhanceResponse(data, topic) {
  const fallback = createEnhancedFallbackResponse(topic);
  return {
    overview: data.overview || fallback.overview,
    roadmap: data.roadmap || fallback.roadmap,
    certifications: Array.isArray(data.certifications) ? data.certifications : fallback.certifications,
    skills: Array.isArray(data.skills) ? data.skills : fallback.skills,
    jobs: data.jobs || fallback.jobs,
    news: Array.isArray(data.news) ? data.news : fallback.news,
    advice: data.advice || fallback.advice,
    marketSize: data.marketSize || fallback.marketSize,
    growth: data.growth || fallback.growth,
    jobGrowth: data.jobGrowth || fallback.jobGrowth,
    keyTakeaways: Array.isArray(data.keyTakeaways) ? data.keyTakeaways : fallback.keyTakeaways,
  };
}

// -------------------
// Feedback API
// -------------------
const FEEDBACK_FILE = path.join(__dirname, "feedback.json");

// Ensure file exists
if (!fs.existsSync(FEEDBACK_FILE)) {
  fs.writeFileSync(FEEDBACK_FILE, "[]", "utf-8");
}

app.post("/api/feedback", async (req, res) => {
  try {
    const {
      rating,
      mood,
      category,
      message,
      name,
      email,
      screenshot,
      attachments,
      timestamp,
    } = req.body;

    if (!message || message.length < 10) {
      return res.status(400).json({ error: "Feedback message too short" });
    }

    const feedbackEntry = {
      id: Date.now(),
      rating: rating || 0,
      mood: mood || "",
      category: category || "General",
      message,
      name: name || "",
      email: email || "",
      screenshot: screenshot || "",
      attachments: attachments || [],
      timestamp: timestamp || new Date().toISOString(),
    };

    const existing = JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf-8"));
    existing.push(feedbackEntry);
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(existing, null, 2));

    res.json({ success: true, entry: feedbackEntry });
  } catch (err) {
    console.error("Feedback API error:", err);
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

/// -------------------
// Project Planner Fallback + Validator
// -------------------
function createProjectPlannerFallback(idea, domain, duration, teamSize, complexity) {
  const template = {
    requirements: ["Requirement 1", "Requirement 2", "Requirement 3"],
    risks: ["Risk 1", "Risk 2", "Risk 3"],
    tools: "Git, Docker, Node.js"
  };
  return {
    overview: `A ${complexity} ${domain} project: ${idea}`,
    requirements: template.requirements,
    roadmap: [
      "Define scope",
      "Set up environment",
      "Develop core features",
      "Testing & QA",
      "Deployment",
      "Documentation"
    ],
    roles: [
      { role: "Developer", responsibilities: ["Code", "Test", "Deploy"] }
    ],
    timeline: [
      { milestone: "Planning", time: "1 week" },
      { milestone: "Development", time: "3 weeks" }
    ],
    deliverables: ["Source code", "Documentation"],
    risks: template.risks,
    suggestions: `Recommended tools: ${template.tools}`
  };
}

function validateProjectPlanResponse(data, idea, domain, duration, teamSize, complexity) {
  const fallback = createProjectPlannerFallback(idea, domain, duration, teamSize, complexity);
  return {
    overview: data.overview || fallback.overview,
    requirements: Array.isArray(data.requirements) ? data.requirements : fallback.requirements,
    roadmap: Array.isArray(data.roadmap) ? data.roadmap : fallback.roadmap,
    roles: Array.isArray(data.roles) ? data.roles : fallback.roles,
    timeline: Array.isArray(data.timeline) ? data.timeline : fallback.timeline,
    deliverables: Array.isArray(data.deliverables) ? data.deliverables : fallback.deliverables,
    risks: Array.isArray(data.risks) ? data.risks : fallback.risks,
    suggestions: data.suggestions || fallback.suggestions
  };
}

// -------------------
// ✅ Project Planner API using Gemini
// -------------------
app.post("/api/project-planner", async (req, res) => {
  const { idea, domain, duration, teamSize, complexity } = req.body;

  if (!idea || !domain || !duration || !teamSize || !complexity) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const prompt = `
        You are an expert project manager and technical architect. Create a comprehensive project plan:

        Project Idea: "${idea}"
        Domain: ${domain}
        Duration: ${duration}
        Team Size: ${teamSize}
        Complexity: ${complexity}

        CRITICAL: Respond ONLY with valid JSON. No markdown, no code blocks, no explanations.

        Return this JSON:
        {
          "overview": "2-3 sentence project overview",
          "requirements": [
            "List all functional requirements",
            "Include recommended technologies, frameworks, programming languages, and tools (e.g., React, Node.js, MongoDB, AWS, etc.)"
          ],
          "roadmap": ["step1","step2","step3","step4","step5","step6","step7","step8"],
          "roles": [
            {"role":"Role Name", "responsibilities":["resp1","resp2","resp3"]}
          ],
          "timeline": [
            {"milestone":"Milestone Name","time":"X weeks"}
          ],
          "deliverables": ["deliverable1","deliverable2"],
          "risks": ["risk1","risk2"],
          "suggestions": "Detailed suggestions with specific tech stack and best practices"
        }

        Focus especially on including the full recommended technology stack (front-end, back-end, database, deployment tools) in the "requirements".
        `;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    let aiText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!aiText) throw new Error("Empty response from Gemini");
    aiText = aiText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(aiText);
    } catch {
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed) parsed = createProjectPlannerFallback(idea, domain, duration, teamSize, complexity);
    parsed = validateProjectPlanResponse(parsed, idea, domain, duration, teamSize, complexity);

    res.json(parsed);
  } catch (error) {
    console.error("Gemini Project Planner error:", error.message);
    res.status(500).json({
      error: `Gemini API failed → fallback mode: ${error.message}`,
      ...createProjectPlannerFallback(idea, domain, duration, teamSize, complexity)
    });
  }
});


app.get(/.*/, (req, res) =>
  res.sendFile(path.join(__dirname, "public/index.html"))
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running with Gemini at http://localhost:${PORT}`)
);
