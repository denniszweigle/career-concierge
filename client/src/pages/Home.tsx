import { FileSearch, Brain, MessageSquare } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <header className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Personal Career Concierge</h1>
            <p className="text-sm text-slate-600">AI-Powered Portfolio Analysis</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="flex justify-center mb-4">
            <img
              src="/profile.jpg"
              alt="Dennis DZ Zweigle"
              width={80}
              height={80}
              className="rounded-full object-cover ring-2 ring-slate-200"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <h2 className="text-5xl font-bold text-slate-900 mb-6">
            Dennis DZ Zweigle Portfolio
          </h2>
          <p className="text-xl text-slate-600">
          Welcome to a transparent look at my career. </br></br> This platform uses a 2 stagged RAG technology leveraging LangChain to analyze how my experience aligns with specific job roles. </br></br>From the Dockerized deployment to the GitHub Actions CI/CD, every line of code was directed and architected by me, using AI as a specialized tool to accelerate development. </br></br>Go ahead—ask the site anything about my tech capabilities or my process.
          </p>
          <ul className="text-xl text-slate-600 mt-4 space-y-2 text-left list-disc list-inside">
            <li>
              To analyze a job description against this portfolio, visit{" "}
              <a href="/match" className="text-blue-600 hover:underline">Match</a>
            </li>
            <li>
              To view interactive job match reporting and export data for Power BI, visit{" "}
              <a href="/reports" className="text-blue-600 hover:underline">Reports</a>
            </li>
            <li>
              To learn more about the project, visit{" "}
              <a href="/tech" className="text-blue-600 hover:underline">Tech</a>
            </li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <FileSearch className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Document Indexing</h3>
            <p className="text-slate-600">
              Portfolio documents including PDF, DOCX, PPTX, XLSX, and TXT files are indexed and
              ready for semantic search.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Brain className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">AI-Powered Matching</h3>
            <p className="text-slate-600">
              Chain of Density algorithm analyzes job descriptions to identify both obvious and subtle
              requirements for honest scoring.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
              <MessageSquare className="h-6 w-6 text-teal-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Conversational Q&A</h3>
            <p className="text-slate-600">
              Ask questions about experience, skills, and background with answers grounded in actual
              portfolio documents.
            </p>
          </div>
        </div>

      </main>

      <footer className="container mx-auto px-4 py-8 mt-16 border-t">
        <div className="text-center text-sm text-slate-600">
          <p>Personal Career Concierge for Dennis "DZ" Zweigle</p>
          <p className="mt-2">Powered by RAG technology and LLM-based semantic analysis</p>
          <p className="mt-2">
            <a href="/admin" className="text-slate-400 hover:text-slate-600 transition-colors">
              Admin
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
