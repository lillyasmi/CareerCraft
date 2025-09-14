const stars = document.getElementById("star-rating");
const moodSelect = document.getElementById("mood-select");
const messageBox = document.getElementById("message");
const charCount = document.getElementById("char-count");
const contactCheck = document.getElementById("contact-check");
const contactInfo = document.getElementById("contact-info");
const form = document.getElementById("feedback-form");
const thankyou = document.getElementById("thankyou");
const fileList = document.getElementById("file-list");

let selectedRating = 0;
let selectedMood = "";

// ⭐ Star rating with gold color
stars.innerHTML = Array(5).fill("☆").map((s,i)=>`<span data-val="${i+1}" class="star">☆</span>`).join("");
stars.addEventListener("click", e=>{
  if(e.target.dataset.val){
    selectedRating = parseInt(e.target.dataset.val);
    [...stars.children].forEach((s,i)=>{
      s.textContent = i < selectedRating ? "★":"☆";
      s.classList.toggle("selected", i < selectedRating);
    });
  }
});

// 😊 Mood select
moodSelect.addEventListener("click", e=>{
  if(e.target.dataset.mood){
    selectedMood = e.target.dataset.mood;
    [...moodSelect.children].forEach(m=>m.classList.remove("active"));
    e.target.classList.add("active");
  }
});

// Character count
messageBox.addEventListener("input", ()=>{
  charCount.textContent = `${messageBox.value.length} / 500`;
});

// Contact checkbox
contactCheck.addEventListener("change", ()=>{
  contactInfo.style.display = contactCheck.checked ? "block":"none";
});

// Show file list
document.getElementById("extra-files").addEventListener("change", (e)=>{
  fileList.innerHTML = [...e.target.files].map(f=>`📎 ${f.name} (${(f.size/1024).toFixed(1)} KB)`).join("<br>");
});

// Submit Feedback
form.addEventListener("submit", async (e)=>{
  e.preventDefault();

  const category = document.getElementById("category").value;
  const message = messageBox.value.trim();
  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const screenshotFile = document.getElementById("screenshot").files[0];
  const extraFiles = document.getElementById("extra-files").files;

  if(message.length < 20){
    alert("Please enter at least 20 characters in feedback.");
    return;
  }

  let attachments = [];
  if(extraFiles.length > 0){
    for(let f of extraFiles){
      attachments.push({ name: f.name, type: f.type, size: f.size });
    }
  }

  let screenshotBase64 = "";
  if(screenshotFile){
    const reader = new FileReader();
    reader.onload = async ()=>{
      screenshotBase64 = reader.result;
      await sendFeedback(category, message, name, email, screenshotBase64, attachments);
    };
    reader.readAsDataURL(screenshotFile);
  } else {
    await sendFeedback(category, message, name, email, screenshotBase64, attachments);
  }
});

async function sendFeedback(category, message, name, email, screenshot, attachments){
  const body = {
    rating: selectedRating,
    mood: selectedMood,
    category,
    message,
    name,
    email,
    screenshot,
    attachments,
    timestamp: new Date().toISOString()
  };

  try{
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if(!data.success) throw new Error(data.error || "Unknown error");

    console.log("Feedback saved:", data);

    form.reset();
    selectedRating = 0;
    selectedMood = "";
    [...stars.children].forEach(s=>{ s.textContent="☆"; s.classList.remove("selected"); });
    [...moodSelect.children].forEach(m=>m.classList.remove("active"));
    charCount.textContent="0 / 500";
    fileList.innerHTML="";

    thankyou.style.display="block";
    setTimeout(()=> thankyou.style.display="none", 4000);
  }catch(err){
    console.error("Feedback error:",err);
    alert("⚠️ Failed to submit feedback");
  }
}
