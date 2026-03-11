# C-TAG Online Exam Platform

A robust, AI-powered Online Exam Platform designed for the C-TAG Institute. This platform provides a seamless experience for both administrators and students, featuring automated proctoring, real-time analytics, and a professional testing environment.

## 🚀 Key Features

### For Students
- **Interactive Exam Engine**: A professional testing interface with a real-time question pallet for easy navigation.
- **AI Proctoring**: Automated camera monitoring and tab-switching detection to ensure exam integrity.
- **Personalized Dashboard**: View upcoming exams, track past performance, and access instant results.
- **Topic-Wise Feedback**: Detailed breakdown of performance across different subjects.

### For Administrators
- **In-Depth Analytics**: Visualize student performance with interactive charts (Score Distribution, Average Scores, etc.).
- **Topic Performance Tracking**: Identify specific areas where students struggle (Wrong Topics vs. Skipped Topics).
- **Excel Export**: Generate comprehensive performance reports with a single click, including topic-wise lists.
- **Exam Management**: Easily schedule exams, manage question banks, and monitor proctoring logs.
- **Security Logs**: Real-time tracking of proctoring violations (e.g., "Tab Switched", "User Left Camera").

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion (Animations)
- **Backend**: Node.js, Express
- **Database**: SQLite (Better-SQLite3)
- **Data Visualization**: Recharts
- **Icons**: Lucide-React
- **Reporting**: XLSX (Excel generation)

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/ctag-online-exam-platform.git
   cd ctag-online-exam-platform
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Access the platform**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔒 Security & Proctoring

The platform uses a multi-layered approach to prevent cheating:
- **Camera Monitoring**: Uses the Web Media API to ensure the student remains in front of the screen.
- **Visibility Tracking**: Detects when a student switches tabs or minimizes the browser window.
- **Custom Modals**: Replaces standard browser alerts to prevent interruption of the proctoring flow.

## 📊 Analytics Engine

The analytics engine calculates performance metrics at a granular level:
- **Correct/Wrong/Skipped**: Basic question-level tracking.
- **Topic-Wise Breakdown**: Automatically identifies which topics are being skipped or answered incorrectly by analyzing the exam's question metadata.

---

Built with ❤️ for C-TAG Institute.
