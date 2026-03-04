# Personal Career Concierge

**Author:** dz zweigle

A RAG-based (Retrieval-Augmented Generation) web application that acts as an autonomous recruiter for Dennis "DZ" Zweigle's personal brand. The system connects to a Google Drive portfolio folder, indexes career documents (PDFs, DOCX, PPTX), and provides AI-powered job description matching with transparent Match vs. Mismatch reports.

## Overview

The Personal Career Concierge analyzes job descriptions against indexed portfolio documents to provide data-driven insights into candidate alignment. The system uses a weighted scoring algorithm across four pillars: Hard Skills (40%), Experience Depth (30%), Domain Context (20%), and Soft Skills/Culture (10%).

## Key Features

### Document Indexing & Processing
- **Google Drive Integration**: OAuth 2.0 authentication to access shared portfolio folders
- **Recursive Folder Scanning**: Automatically discovers and indexes PDF, DOCX, and PPTX files
- **Text Extraction**: Extracts content from documents for semantic analysis
- **Vector Embeddings**: Generates embeddings for efficient similarity search using LLM-based techniques

### AI-Powered Matching
- **Chain of Density Analysis**: Multi-pass requirement extraction that identifies both obvious and subtle job requirements
- **RAG Architecture**: Retrieval-Augmented Generation for evidence-based matching
- **Weighted Scoring**: Four-pillar scoring system with configurable weights
- **Gap Detection**: Transparent identification of missing qualifications

### Interactive Features
- **Match/Mismatch Dashboard**: Visual representation of alignment scores and category breakdowns
- **Conversational Q&A**: Ask questions about the candidate's background with answers grounded in actual documents
- **Document Management**: Sync status, re-indexing controls, and document inventory

## Technical Architecture

### Backend Stack
- **Framework**: Express 4 with tRPC 11 for type-safe API
- **Database**: MySQL/TiDB with Drizzle ORM
- **Authentication**: Manus OAuth for user management
- **Document Processing**: mammoth (DOCX), pdf-lib (PDF), jszip (PPTX)
- **AI Integration**: Built-in LLM service for embeddings and analysis

### Frontend Stack
- **Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS 4 with shadcn/ui components
- **Routing**: wouter for client-side navigation
- **State Management**: tRPC React Query hooks
- **UI Components**: Radix UI primitives with custom styling

## Third-Party APIs

### Google Drive API
**Purpose**: Provides programmatic access to the portfolio folder containing career documents (resumes, articles, presentations).

**Function**: The application uses the Google Drive API v3 to:
- Authenticate users via OAuth 2.0
- List files recursively within the specified shared folder
- Download file contents for text extraction
- Monitor file modifications for incremental sync

**Why Needed**: The portfolio documents are stored in Google Drive, making the Drive API essential for accessing and indexing the source material. This approach allows the portfolio owner to manage documents in a familiar environment while the application automatically stays synchronized.

**Implementation**: Located in `server/googleDrive.ts`, using the `googleapis` npm package (v171.4.0).

### Manus Built-in LLM Service
**Purpose**: Provides large language model capabilities for text analysis, embedding generation, and conversational AI.

**Function**: The application uses the LLM service to:
- Generate vector embeddings for document chunks
- Extract job requirements using Chain of Density prompting
- Calculate semantic similarity between requirements and portfolio evidence
- Generate detailed match/mismatch reports
- Answer questions about the candidate's background

**Why Needed**: The core RAG functionality depends on semantic understanding of both job descriptions and portfolio documents. The LLM service enables intelligent matching beyond simple keyword search, identifying implicit requirements and providing natural language explanations.

**Implementation**: Located in `server/_core/llm.ts`, accessed via the `invokeLLM` helper function with automatic credential injection.

## Database Schema

### Core Tables
- **users**: Authentication and user management
- **driveTokens**: OAuth tokens for Google Drive access
- **documents**: Indexed portfolio files with metadata
- **documentChunks**: Text segments with vector embeddings
- **analyses**: Job description analysis sessions
- **chatMessages**: Conversational Q&A history

## Setup Instructions

### Prerequisites
1. Google Cloud Console project with Drive API enabled
2. OAuth 2.0 credentials (Client ID and Secret)
3. Manus account with project access

### Configuration
1. Set Google Drive OAuth credentials via the application UI or environment variables:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`

2. Update the portfolio folder URL in `server/routers.ts`:
   ```typescript
   const PORTFOLIO_FOLDER_URL = "https://drive.google.com/drive/folders/YOUR_FOLDER_ID";
   ```

### Running the Application
```bash
# Install dependencies
pnpm install

# Push database schema
pnpm db:push

# Start development server
pnpm dev

# Run tests
pnpm test
```

## Usage Workflow

### 1. Connect Google Drive
Navigate to the Dashboard and click "Connect Google Drive". Complete the OAuth flow to authorize access to the portfolio folder.

### 2. Sync Documents
Click "Sync Documents" to scan the folder, extract text from files, and generate vector embeddings. This process may take several minutes depending on the number and size of documents.

### 3. Analyze Job Description
Paste a job description into the analysis form. Optionally provide a job title for better context. Click "Analyze Match" to initiate the matching process.

### 4. Review Results
The analysis page displays:
- Overall Match and Mismatch scores
- Category-level scores (Hard Skills, Experience, Domain, Soft Skills)
- Top 3 alignment strengths with evidence
- Top 3 critical gaps
- Detailed narrative report

### 5. Ask Questions
Use the conversational Q&A interface to explore specific aspects of the candidate's background. Questions are answered using relevant chunks from the indexed documents.

## Scoring Algorithm

The matching algorithm uses a weighted scoring system:

```
Match Score = (Hard Skills × 0.4) + (Experience × 0.3) + (Domain × 0.2) + (Soft Skills × 0.1)
Mismatch Score = 100 - Match Score
```

Each category score is calculated by:
1. Extracting requirements using Chain of Density prompting
2. Generating embeddings for each requirement
3. Finding top matching document chunks via cosine similarity
4. Averaging similarity scores across all requirements in the category

## Chain of Density Protocol

The system uses a multi-pass analysis technique to ensure comprehensive requirement extraction:

1. **First Pass**: Extract obvious requirements
2. **Second Pass**: Find implicit requirements and preferences
3. **Third Pass**: Identify subtle requirements easily missed
4. **Fourth Pass**: Detect requirements hidden in culture or role descriptions

This approach prevents the system from acting as a "hype bot" and ensures honest, professional assessments.

## Development Notes

### Document Extraction Limitations
The current PDF extraction implementation uses `pdf-lib`, which does not include built-in text extraction. For production use, consider integrating `pdf.js` or a similar library with OCR capabilities.

### Vector Embedding Approach
The application uses a simplified embedding technique for demonstration. Production deployments should integrate dedicated embedding models (e.g., OpenAI's text-embedding-ada-002) for improved semantic accuracy.

### Scalability Considerations
- Document sync is currently synchronous; consider implementing background job processing for large portfolios
- Vector similarity search is performed in-memory; consider integrating a vector database (Pinecone, Weaviate) for production scale

## License

MIT

## Contact

For questions or support, contact dz zweigle.
