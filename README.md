# 🚀 CareerCraft Web App  

An AI-powered career guidance and project planning platform built with **Node.js, Express, and Gemini/OpenAI APIs**.  
This app helps users with:
- ✅ **AI Resume Parser**
- ✅ **Mock Interview Simulator**
- ✅ **Industry Trends Insights**
- ✅ **Feedback System**
- ✅ **Project Planner** (with Gemini fallback)

---

## ✨ Features

### 📝 AI Resume Parser
Upload raw resume text and get a **structured JSON** with personal details, education, skills, projects, and experience.

### 🎤 Mock Interview
- Start a **real-time AI interview**  
- Receive **instant feedback** and **ideal answers**  
- Difficulty levels supported

### 📊 Industry Trends
- Get **market analysis**, skills demand, job growth, and certifications for any technology.

### 💡 Project Planner
- Enter an idea, domain, team size, complexity →  
- Get a **complete project plan** with:
  - Overview
  - Requirements (🔑 includes recommended tech stack)
  - Roadmap & timeline
  - Roles & responsibilities
  - Risks & Deliverables
  - Tools & suggestions

### 💬 Feedback System
- Collect and store user feedback with optional screenshot/attachments.

---

## 🛠️ Tech Stack
**Frontend:** HTML, CSS, Vanilla JS  
**Backend:** Node.js, Express  
**AI Services:**  
- [Gemini 1.5 Flash](https://ai.google.dev) (primary)  
- OpenAI GPT-3.5 (fallback for project planner if Gemini fails)  
**Storage:** Local JSON for feedback  
**Other:** dotenv, cors, path

---

## 🔑 Environment Variables

Create a `.env` file in the root:

```env
PORT=3000
GEMINI_API_KEY=your_google_gemini_api_key

# Separate keys for different features (optional but recommended)
RESUME_API_KEY=your_gemini_api_key_for_resume
INTERVIEW_API_KEY=your_gemini_api_key_for_interview
TRENDS_API_KEY=your_gemini_api_key_for_trends

# If you want to use OpenAI fallback for Project Planner
OPENAI_API_KEY=your_openai_api_key
