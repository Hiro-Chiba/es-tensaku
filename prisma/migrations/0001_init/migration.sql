-- CreateTable
CREATE TABLE "ReviewSession" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Essay" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "topic" TEXT,
    "content" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Essay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "essayId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "sectionScores" JSONB NOT NULL,
    "summaryMarkdown" TEXT NOT NULL,
    "rewriteSuggestion" TEXT NOT NULL,
    "learningTasks" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InlineIssue" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "startIndex" INTEGER NOT NULL,
    "endIndex" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,

    CONSTRAINT "InlineIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenUsageLog" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "responseTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSession_sessionKey_key" ON "ReviewSession"("sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_essayId_key" ON "Evaluation"("essayId");

-- AddForeignKey
ALTER TABLE "Essay" ADD CONSTRAINT "Essay_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "Essay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InlineIssue" ADD CONSTRAINT "InlineIssue_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsageLog" ADD CONSTRAINT "TokenUsageLog_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

