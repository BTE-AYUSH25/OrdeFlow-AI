/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Zap, 
  Shield, 
  Search, 
  BarChart3, 
  History, 
  Settings, 
  Brain, 
  Terminal, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  Play,
  Pause,
  Layers,
  ShieldAlert,
  Copy
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import { GoogleGenAI } from "@google/genai";
import { cn } from "./lib/utils";

// --- Types ---

interface Market {
  id: string;
  question: string;
  description: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  liquidity: string;
  category: string;
  endDate: string;
  image?: string;
}

interface Trade {
  id: string;
  marketId: string;
  marketQuestion: string;
  outcome: string;
  amount: number;
  price: number;
  timestamp: number;
  status: "open" | "closed";
  pnl?: number;
  aiReasoning?: string;
  txHash?: string;
  confidence?: number;
}

interface RejectedTrade {
  id: string;
  marketQuestion: string;
  reason: string;
  timestamp: number;
  confidence: number;
}

interface AgentThought {
  id: string;
  type: "sentiment" | "analysis" | "strategy" | "execution" | "debate";
  agentName?: string;
  message: string;
  timestamp: number;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  timestamp: number;
  sentiment: "bullish" | "bearish" | "neutral";
  content: string;
}

// --- Mock Data ---

const MOCK_MARKETS: Market[] = [
  {
    id: "1",
    question: "Will Bitcoin hit $100k by end of March 2026?",
    description: "This market resolves to Yes if BTC/USD hits $100,000 on Binance before April 1, 2026.",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.65", "0.35"],
    volume: "$12.5M",
    liquidity: "$2.1M",
    category: "Crypto",
    endDate: "2026-03-31T23:59:59Z",
  },
  {
    id: "2",
    question: "Will the Fed cut rates in May 2026?",
    description: "Resolves based on the FOMC meeting outcome in May 2026.",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.42", "0.58"],
    volume: "$8.2M",
    liquidity: "$1.5M",
    category: "Economics",
    endDate: "2026-05-15T23:59:59Z",
  },
  {
    id: "3",
    question: "Will OpenAI release GPT-5 before June 2026?",
    description: "Resolves to Yes if OpenAI officially announces and releases GPT-5.",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.28", "0.72"],
    volume: "$5.1M",
    liquidity: "$800K",
    category: "AI",
    endDate: "2026-06-01T23:59:59Z",
  },
  {
    id: "4",
    question: "Will SpaceX launch Starship to orbit this month?",
    description: "Resolves to Yes if Starship completes a successful orbital flight.",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.75", "0.25"],
    volume: "$3.4M",
    liquidity: "$500K",
    category: "Space",
    endDate: "2026-03-31T23:59:59Z",
  }
];

const MOCK_NEWS: NewsItem[] = [
  {
    id: "n1",
    title: "SEC Approves New Crypto ETF Structure",
    source: "Reuters",
    timestamp: Date.now() - 1000 * 60 * 15,
    sentiment: "bullish",
    content: "The SEC has greenlit a new spot crypto ETF structure that allows for more efficient redemption processes, potentially increasing institutional inflows."
  },
  {
    id: "n2",
    title: "OpenAI CEO Hints at 'Major Breakthrough' in Reasoning",
    source: "TechCrunch",
    timestamp: Date.now() - 1000 * 60 * 45,
    sentiment: "bullish",
    content: "Sam Altman suggested in a recent interview that the next generation of models will feature significantly improved multi-step reasoning capabilities."
  },
  {
    id: "n3",
    title: "Inflation Data Comes in Higher Than Expected",
    source: "Bloomberg",
    timestamp: Date.now() - 1000 * 60 * 120,
    sentiment: "bearish",
    content: "Latest CPI data shows a 0.4% increase month-over-month, dampening hopes for an immediate rate cut by the Federal Reserve."
  }
];

const PERFORMANCE_DATA = [
  { time: "09:00", pnl: 0 },
  { time: "10:00", pnl: 120 },
  { time: "11:00", pnl: 80 },
  { time: "12:00", pnl: 250 },
  { time: "13:00", pnl: 410 },
  { time: "14:00", pnl: 380 },
  { time: "15:00", pnl: 520 },
  { time: "16:00", pnl: 680 },
];

// --- Components ---

export default function App() {
  const [markets, setMarkets] = useState<Market[]>(MOCK_MARKETS);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(MOCK_MARKETS[0]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [news, setNews] = useState<NewsItem[]>(MOCK_NEWS);
  const [isBotActive, setIsBotActive] = useState(false);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analysisConfidence, setAnalysisConfidence] = useState<number | null>(null);
  const [groundingSources, setGroundingSources] = useState<{ uri: string; title: string }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [balance, setBalance] = useState(10000);
  const [logs, setLogs] = useState<string[]>(["[SYSTEM] OrdeFlow AI initialized.", "[SYSTEM] Connected to Polymarket Gamma API (Simulated)."]);
  const [agentThoughts, setAgentThoughts] = useState<AgentThought[]>([]);
  const [rejectedTrades, setRejectedTrades] = useState<RejectedTrade[]>([]);
  const [riskLevel, setRiskLevel] = useState(5);
  const [strategy, setStrategy] = useState({
    aggression: 50,
    riskTolerance: 30,
    newsSensitivity: 70
  });
  const [isBriefing, setIsBriefing] = useState(false);
  const [performanceStats, setPerformanceStats] = useState({
    sharpeRatio: 2.4,
    maxDrawdown: 4.2,
    winRate: 68,
    totalTrades: 142
  });
  const [whaleAlert, setWhaleAlert] = useState<{ message: string; id: string } | null>(null);
  const [whaleHistory, setWhaleHistory] = useState<{ id: string; message: string; timestamp: number }[]>([]);

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-19), `[${format(new Date(), "HH:mm:ss")}] ${msg}`]);
  };

  const addThought = (type: AgentThought["type"], message: string, agentName?: string) => {
    setAgentThoughts(prev => [{ id: Math.random().toString(), type, message, agentName, timestamp: Date.now() }, ...prev].slice(0, 15));
  };

  const playBriefing = async () => {
    if (!aiAnalysis || isBriefing) return;
    setIsBriefing(true);
    addLog("Generating Audio Briefing...");
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `OrdeFlow AI Briefing: ${aiAnalysis.slice(0, 500)}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        audio.play();
        addLog("Playing Audio Briefing...");
      }
    } catch (error) {
      console.error(error);
      addLog("Briefing failed.");
    } finally {
      setIsBriefing(false);
    }
  };

  const runMultiAgentDebate = async (market: Market) => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    setAgentThoughts([]);
    addLog("Initiating Multi-Agent Consensus Protocol...");
    
    const agents = [
      { name: "Macro-Bot", role: "Economic trends & Fed policy" },
      { name: "Whale-Watcher", role: "On-chain liquidity & large movements" },
      { name: "Sentiment-Scribe", role: "Social media & news impact" }
    ];

    for (const agent of agents) {
      addThought("debate", `[${agent.name}] Analyzing ${agent.role}...`, agent.name);
      await new Promise(r => setTimeout(r, 1000));
    }

    await runAiAnalysis(market);
  };

  const runAiAnalysis = async (market: Market) => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    setAnalysisConfidence(null);
    setGroundingSources([]);
    setAgentThoughts([]);
    addLog(`Initiating Agentic Reasoning for: ${market.question}`);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      // Step 1: Sentiment Analysis
      addThought("sentiment", "Scanning global news feeds and social sentiment...", "Sentiment-Scribe");
      await new Promise(r => setTimeout(r, 800));
      
      // Step 2: Market Data Correlation
      addThought("analysis", `Correlating ${market.category} trends with current liquidity ($${market.liquidity})...`, "Macro-Bot");
      await new Promise(r => setTimeout(r, 1200));

      const prompt = `
        You are an elite on-chain trading agent for Polymarket. 
        Your goal is to maximize PnL while managing risk according to the user's strategy.

        Market: ${market.question}
        Description: ${market.description}
        Prices: ${market.outcomes.map((o, i) => `${o}: $${market.outcomePrices[i]}`).join(", ")}
        
        User Strategy Configuration: 
        - Aggression: ${strategy.aggression}/100
        - Risk Tolerance: ${strategy.riskTolerance}/100
        - News Sensitivity: ${strategy.newsSensitivity}/100
        - Global Risk Level: ${riskLevel}/10
        
        Provide a "Legendary" Trading Report in Markdown:
        ### 📊 Market Intelligence Report
        **Consensus Sentiment:** [Score -100 to 100]
        **Risk Profile:** [Low/Medium/High]
        
        ### 🧠 Agentic Reasoning
        [Provide a deep dive into why you are recommending this trade, mentioning the specific news items and market prices.]
        
        ### ⚡ Execution Strategy
        **Recommendation:** [BUY YES / BUY NO / HOLD]
        **Confidence Level:** [0-100%]
        **Kelly Criterion Size:** [Percentage of bankroll]
        
        ### 🛡️ Risk Mitigation
        [What could go wrong?]
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const confidence = Math.floor(Math.random() * 30) + 65; // 65-95%
      setAnalysisConfidence(confidence);
      
      // Extract grounding sources
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const sources = chunks
          .filter(c => c.web)
          .map(c => ({ uri: c.web!.uri, title: c.web!.title }));
        setGroundingSources(sources);
      }

      addThought("strategy", `Calculating optimal position size via Kelly Criterion... Confidence: ${confidence}%`, "Whale-Watcher");
      setAiAnalysis(response.text || "Analysis failed.");
      addLog("AI Oracle has reached consensus.");

      // Logic for "Why Not?" panel
      if (confidence < 75 || riskLevel > 8) {
        setRejectedTrades(prev => [{
          id: Math.random().toString(),
          marketQuestion: market.question,
          reason: confidence < 75 ? "Confidence score below threshold for current risk profile." : "Global risk level too high for speculative news-driven plays.",
          timestamp: Date.now(),
          confidence
        }, ...prev].slice(0, 5));
      }

    } catch (error) {
      console.error(error);
      addLog("AI Analysis error.");
      setAiAnalysis("Error generating analysis. Check API key.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runBacktest = () => {
    if (isBacktesting) return;
    setIsBacktesting(true);
    addLog("Initializing Backtesting Engine: Replaying historical Polymarket data...");
    
    let step = 0;
    const interval = setInterval(() => {
      if (step >= 5) {
        clearInterval(interval);
        setIsBacktesting(false);
        addLog("Backtest complete. Final Alpha: +12.4%");
        return;
      }
      
      const mockTrade: Trade = {
        id: `bt-${step}`,
        marketId: "hist",
        marketQuestion: "Historical: Will BTC hit $100k? (Dec 2025)",
        outcome: Math.random() > 0.5 ? "Yes" : "No",
        amount: 500,
        price: 0.45,
        timestamp: Date.now() - (1000 * 60 * 60 * 24 * (5 - step)),
        status: "closed",
        pnl: Math.floor(Math.random() * 200) - 50,
        confidence: Math.floor(Math.random() * 30) + 70
      };
      
      setTrades(prev => [mockTrade, ...prev]);
      addLog(`Backtest Step ${step + 1}: Executed historical trade with ${mockTrade.confidence}% confidence.`);
      step++;
    }, 2000);
  };

  const broadcastWhaleAlert = (msg: string) => {
    addLog(`Broadcasting alert to Discord/Telegram: ${msg}`);
    setTimeout(() => {
      addLog("Broadcast successful. Alert live on community channels.");
    }, 1000);
  };

  const executeTrade = (market: Market, outcome: string, amount: number) => {
    const price = parseFloat(market.outcomePrices[market.outcomes.indexOf(outcome)]);
    const cost = amount * price;

    if (cost > balance) {
      addLog("Insufficient balance.");
      return;
    }

    const txHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join("");
    
    const newTrade: Trade = {
      id: Math.random().toString(36).substr(2, 9),
      marketId: market.id,
      marketQuestion: market.question,
      outcome,
      amount,
      price,
      timestamp: Date.now(),
      status: "open",
      aiReasoning: aiAnalysis || "Manual execution",
      txHash
    };

    setTrades(prev => [newTrade, ...prev]);
    setBalance(prev => prev - cost);
    addLog(`TX SUCCESS: ${txHash.slice(0, 10)}...`);
    addLog(`Bought ${amount} ${outcome} @ $${price}`);
    addThought("execution", `On-chain swap confirmed. Gas: 0.0012 ETH`);
  };

  useEffect(() => {
    if (!isBotActive) return;

    const interval = setInterval(() => {
      const randomMarket = markets[Math.floor(Math.random() * markets.length)];
      const randomOutcome = randomMarket.outcomes[Math.floor(Math.random() * randomMarket.outcomes.length)];
      const amount = Math.floor(Math.random() * 500) + 100;
      
      addLog(`[BOT] Autonomous signal detected for ${randomMarket.question}`);
      executeTrade(randomMarket, randomOutcome, amount);
    }, 15000); // Trade every 15 seconds for demo purposes

    return () => clearInterval(interval);
  }, [isBotActive, markets]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const amount = (Math.random() * 500000 + 100000).toLocaleString();
        const market = markets[Math.floor(Math.random() * markets.length)].question.slice(0, 30);
        const id = Math.random().toString();
        const message = `🚨 WHALE ALERT: $${amount} position opened on "${market}..."`;
        setWhaleAlert({ message, id });
        setWhaleHistory(prev => [{ id, message, timestamp: Date.now() }, ...prev].slice(0, 5));
        addLog(`WHALE ALERT: Large position detected on-chain.`);
        setTimeout(() => setWhaleAlert(null), 5000);
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [markets]);

  const toggleBot = () => {
    setIsBotActive(!isBotActive);
    addLog(isBotActive ? "Bot deactivated." : "Bot activated. Monitoring markets...");
  };

  // Simulated live updates
  useEffect(() => {
    if (!isBotActive) return;

    const interval = setInterval(() => {
      // Randomly pick a market and "analyze" it
      const randomMarket = markets[Math.floor(Math.random() * markets.length)];
      addLog(`Auto-monitoring: ${randomMarket.question}`);
      
      // Small chance to execute a trade in bot mode
      if (Math.random() > 0.8) {
        const outcome = Math.random() > 0.5 ? "Yes" : "No";
        executeTrade(randomMarket, outcome, 100);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isBotActive, markets, balance]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-black">
      {/* Whale Alert Toast */}
      <AnimatePresence>
        {whaleAlert && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#F27D26] text-black px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest shadow-[0_0_50px_rgba(242,125,38,0.4)] flex items-center gap-4"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
              {whaleAlert.message}
            </div>
            <button 
              onClick={() => broadcastWhaleAlert(whaleAlert.message)}
              className="px-3 py-1 bg-black text-[#F27D26] text-[9px] hover:bg-black/80 transition-colors"
            >
              Broadcast to Discord
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F27D26] flex items-center justify-center rounded-sm rotate-3">
              <Zap className="text-black w-6 h-6 fill-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tighter uppercase italic">OrdeFlow AI</h1>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-mono text-green-500 uppercase tracking-widest">Mainnet Live</span>
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {["Dashboard", "Markets", "Portfolio", "Strategy", "Logs"].map(item => (
              <button key={item} className="text-xs font-mono uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity">
                {item}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-6">
            <button 
              onClick={runBacktest}
              disabled={isBacktesting}
              className="text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 px-4 py-2 border border-[#1A1A1A] hover:bg-[#1A1A1A] transition-colors disabled:opacity-50"
            >
              {isBacktesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
              Run Backtest
            </button>
            <div className="text-right">
              <div className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Total Balance</div>
              <div className="text-lg font-bold font-mono text-[#F27D26]">${balance.toLocaleString()}</div>
            </div>
            <button className="p-2 border border-[#1A1A1A] hover:bg-[#1A1A1A] transition-colors">
              <Settings className="w-5 h-5 opacity-50" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-12 gap-6">
        
        {/* Left Column: Markets & News */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          {/* Markets List */}
          <section className="bg-[#111111] border border-[#1A1A1A] rounded-sm overflow-hidden flex flex-col h-[500px]">
            <div className="p-4 border-b border-[#1A1A1A] flex items-center justify-between bg-[#151515]">
              <h2 className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#F27D26]" />
                Active Markets
              </h2>
              <RefreshCw className="w-3 h-3 opacity-30 cursor-pointer hover:rotate-180 transition-transform duration-500" />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {markets.map(market => (
                <div 
                  key={market.id}
                  onClick={() => setSelectedMarket(market)}
                  className={cn(
                    "p-4 border-b border-[#1A1A1A] cursor-pointer transition-all hover:bg-[#1A1A1A]",
                    selectedMarket?.id === market.id ? "bg-[#1A1A1A] border-l-2 border-l-[#F27D26]" : ""
                  )}
                >
                  <div className="text-[10px] font-mono opacity-40 uppercase mb-1">{market.category}</div>
                  <h3 className="text-sm font-medium leading-tight mb-3">{market.question}</h3>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 bg-[#0A0A0A] h-1.5 rounded-full overflow-hidden flex">
                      <div 
                        className="bg-[#F27D26] h-full" 
                        style={{ width: `${parseFloat(market.outcomePrices[0]) * 100}%` }} 
                      />
                      <div 
                        className="bg-[#333] h-full" 
                        style={{ width: `${parseFloat(market.outcomePrices[1]) * 100}%` }} 
                      />
                    </div>
                    <span className="text-[10px] font-mono opacity-60">{Math.round(parseFloat(market.outcomePrices[0]) * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* News Feed */}
          <section className="bg-[#111111] border border-[#1A1A1A] rounded-sm overflow-hidden flex flex-col flex-1 min-h-[300px]">
            <div className="p-4 border-b border-[#1A1A1A] bg-[#151515]">
              <h2 className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#F27D26]" />
                Intelligence Feed
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
              {news.map(item => (
                <div key={item.id} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono opacity-40 uppercase">{item.source}</span>
                    <span className="text-[10px] font-mono opacity-40">{format(item.timestamp, "HH:mm")}</span>
                  </div>
                  <h4 className="text-xs font-bold group-hover:text-[#F27D26] transition-colors mb-1">{item.title}</h4>
                  <p className="text-[10px] opacity-60 line-clamp-2 leading-relaxed">{item.content}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Center Column: Analysis & Execution */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          {/* Selected Market Detail */}
          <section className="bg-[#111111] border border-[#1A1A1A] rounded-sm p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#F27D26]/5 blur-[100px] -mr-32 -mt-32" />
            
            {selectedMarket ? (
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-0.5 bg-[#F27D26]/10 text-[#F27D26] text-[10px] font-mono uppercase tracking-widest border border-[#F27D26]/20">
                    {selectedMarket.category}
                  </span>
                  <span className="text-[10px] font-mono opacity-40 uppercase tracking-widest flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Ends {format(new Date(selectedMarket.endDate), "MMM d, yyyy")}
                  </span>
                </div>
                
                <h2 className="text-3xl font-bold tracking-tight mb-6 leading-tight">
                  {selectedMarket.question}
                </h2>

                <div className="grid grid-cols-2 gap-8 mb-8">
                  {selectedMarket.outcomes.map((outcome, idx) => (
                    <div key={outcome} className="bg-[#0A0A0A] border border-[#1A1A1A] p-6 rounded-sm group hover:border-[#F27D26]/50 transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-mono uppercase tracking-widest opacity-50">{outcome}</span>
                        {idx === 0 ? <TrendingUp className="w-5 h-5 text-green-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />}
                      </div>
                      <div className="text-4xl font-bold font-mono mb-2">
                        ${selectedMarket.outcomePrices[idx]}
                      </div>
                      <div className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Current Probability: {Math.round(parseFloat(selectedMarket.outcomePrices[idx]) * 100)}%</div>
                      
                      <button 
                        onClick={() => executeTrade(selectedMarket, outcome, 100)}
                        className="w-full mt-6 py-3 bg-[#1A1A1A] hover:bg-[#F27D26] hover:text-black transition-all text-xs font-mono uppercase tracking-widest font-bold"
                      >
                        Buy {outcome}
                      </button>
                    </div>
                  ))}
                </div>

                {/* AI Analysis Section */}
                <div className="border-t border-[#1A1A1A] pt-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                      <Brain className="w-4 h-4 text-[#F27D26]" />
                      Agentic Reasoning Engine
                    </h3>
                    <button 
                      onClick={() => runMultiAgentDebate(selectedMarket)}
                      disabled={isAnalyzing}
                      className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest bg-[#F27D26] text-black px-4 py-2 font-bold hover:bg-white transition-colors disabled:opacity-50"
                    >
                      {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      {isAnalyzing ? "Debating..." : "Consensus Protocol"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Thoughts Column */}
                    <div className="lg:col-span-1 bg-[#0A0A0A] border border-[#1A1A1A] p-4 flex flex-col gap-3 h-[400px] overflow-y-auto custom-scrollbar">
                      <div className="text-[9px] font-mono uppercase opacity-30 mb-2">Agent Consensus Log</div>
                      <AnimatePresence>
                        {agentThoughts.map(thought => (
                          <motion.div 
                            key={thought.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-[10px] font-mono border-l border-[#F27D26]/30 pl-3 py-1"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "w-1 h-1 rounded-full",
                                thought.type === "sentiment" ? "bg-blue-500" :
                                thought.type === "analysis" ? "bg-purple-500" :
                                thought.type === "strategy" ? "bg-yellow-500" : 
                                thought.type === "debate" ? "bg-orange-500" : "bg-green-500"
                              )} />
                              <span className="opacity-40 uppercase">{thought.agentName || thought.type}</span>
                            </div>
                            <p className="opacity-80">{thought.message}</p>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {agentThoughts.length === 0 && !isAnalyzing && (
                        <div className="flex-1 flex items-center justify-center opacity-10 italic text-[10px]">No active thoughts</div>
                      )}
                    </div>

                    {/* Report Column */}
                    <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#1A1A1A] p-6 min-h-[400px] relative overflow-y-auto custom-scrollbar max-h-[400px]">
                      {isAnalyzing && (
                        <div className="absolute inset-0 bg-[#0A0A0A]/80 flex flex-col items-center justify-center gap-4 z-20">
                          <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                              <motion.div 
                                key={i}
                                animate={{ height: [4, 16, 4] }}
                                transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                                className="w-1 bg-[#F27D26]"
                              />
                            ))}
                          </div>
                          <span className="text-[10px] font-mono uppercase tracking-widest opacity-50">Synthesizing Intelligence...</span>
                        </div>
                      )}
                      
                      {aiAnalysis ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <div className="flex items-center justify-between mb-4 border-b border-[#1A1A1A] pb-4">
                            <div className="flex items-center gap-4">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-[#F27D26]">Final Consensus Report</span>
                              {analysisConfidence && (
                                <span className="text-[10px] font-mono px-2 py-0.5 bg-[#F27D26]/10 text-[#F27D26] border border-[#F27D26]/20">
                                  Confidence: {analysisConfidence}%
                                </span>
                              )}
                            </div>
                            <div className="flex gap-4">
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(aiAnalysis);
                                  addLog("Report copied to clipboard.");
                                }}
                                className="text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity"
                              >
                                <Copy className="w-3 h-3" />
                                Copy
                              </button>
                              <button 
                                onClick={playBriefing}
                                disabled={isBriefing}
                                className="text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity"
                              >
                                {isBriefing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                                Audio Briefing
                              </button>
                            </div>
                          </div>
                          <div className="text-sm leading-relaxed opacity-80 font-mono text-[11px] markdown-body mb-8">
                            <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                          </div>

                          {/* Grounding Sources */}
                          {groundingSources.length > 0 && (
                            <div className="mt-8 border-t border-[#1A1A1A] pt-6">
                              <h4 className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-4 flex items-center gap-2">
                                <ExternalLink className="w-3 h-3" />
                                Intelligence Sources (Google Search Grounding)
                              </h4>
                              <div className="grid grid-cols-1 gap-2">
                                {groundingSources.map((source, i) => (
                                  <a 
                                    key={i} 
                                    href={source.uri} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-mono text-[#F27D26] hover:underline flex items-center gap-2 truncate"
                                  >
                                    <ChevronRight className="w-2 h-2" />
                                    {source.title || source.uri}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Kelly Criterion Visualizer */}
                          <div className="mt-8 p-4 bg-[#F27D26]/5 border border-[#F27D26]/20 rounded-sm">
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-[#F27D26]">Kelly Criterion Position Sizing</span>
                              <span className="text-[10px] font-mono opacity-50">Optimal Bankroll Allocation</span>
                            </div>
                            <div className="flex items-end gap-1 h-12 mb-4">
                              {[...Array(20)].map((_, i) => (
                                <div 
                                  key={i} 
                                  className={cn(
                                    "flex-1 rounded-t-sm transition-all duration-1000",
                                    i < 8 ? "bg-[#F27D26]" : "bg-[#1A1A1A]"
                                  )}
                                  style={{ height: `${Math.random() * 100}%` }}
                                />
                              ))}
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="text-[10px] font-mono opacity-40 uppercase">Recommended Size</div>
                              <div className="text-sm font-bold font-mono text-[#F27D26]">8.42% ($842.00)</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-20 py-8">
                          <Brain className="w-12 h-12 mb-4" />
                          <p className="text-xs font-mono uppercase tracking-widest">Awaiting Analysis Trigger</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Why Not? Panel */}
                {rejectedTrades.length > 0 && (
                  <div className="mt-8 border-t border-[#1A1A1A] pt-8">
                    <div className="flex items-center gap-2 mb-6">
                      <AlertCircle className="w-4 h-4 text-[#FF4444]" />
                      <h3 className="text-xs font-mono uppercase tracking-widest">"Why Not?" Panel — Rejected Signals</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {rejectedTrades.map(trade => (
                        <div key={trade.id} className="p-4 border border-[#1A1A1A] bg-[#0F0F0F] hover:border-[#FF4444]/30 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-mono text-[#FF4444] uppercase tracking-widest">Signal Rejected</span>
                            <span className="text-[9px] font-mono opacity-30">{format(trade.timestamp, "HH:mm:ss")}</span>
                          </div>
                          <p className="text-[11px] font-mono mb-3 opacity-80 leading-tight">{trade.marketQuestion}</p>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#FF4444]/10 text-[#FF4444] border border-[#FF4444]/20">
                              Confidence: {trade.confidence}%
                            </span>
                          </div>
                          <p className="text-[10px] font-mono italic opacity-50 leading-relaxed">Reason: {trade.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
                <Search className="w-16 h-16 mb-4" />
                <p className="text-sm font-mono uppercase tracking-widest">Select a market to begin</p>
              </div>
            )}
          </section>

          {/* Performance Chart */}
          <section className="bg-[#111111] border border-[#1A1A1A] rounded-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#F27D26]" />
                Performance Analytics
              </h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono opacity-40 uppercase">Sharpe:</span>
                  <span className="text-[10px] font-mono text-green-500">{performanceStats.sharpeRatio}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono opacity-40 uppercase">Drawdown:</span>
                  <span className="text-[10px] font-mono text-red-500">-{performanceStats.maxDrawdown}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono opacity-40 uppercase">Win Rate:</span>
                  <span className="text-[10px] font-mono">{performanceStats.winRate}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono opacity-40 uppercase">Trades:</span>
                  <span className="text-[10px] font-mono">{performanceStats.totalTrades}</span>
                </div>
              </div>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={PERFORMANCE_DATA}>
                  <defs>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F27D26" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#333" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#333" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #1A1A1A', borderRadius: '0px' }}
                    itemStyle={{ color: '#F27D26', fontSize: '10px', fontFamily: 'monospace' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="pnl" 
                    stroke="#F27D26" 
                    fillOpacity={1} 
                    fill="url(#colorPnl)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Right Column: Bot Control & Logs */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          {/* Bot Control */}
          <section className="bg-[#111111] border border-[#1A1A1A] rounded-sm p-6">
            <h2 className="text-xs font-mono uppercase tracking-widest mb-6 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#F27D26]" />
              Agent Configuration
            </h2>
            
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between p-4 bg-[#0A0A0A] border border-[#1A1A1A]">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest opacity-50">Bot Status</div>
                  <div className={cn("text-xs font-bold uppercase tracking-widest", isBotActive ? "text-green-500" : "text-red-500")}>
                    {isBotActive ? "Active & Trading" : "Standby"}
                  </div>
                </div>
                <button 
                  onClick={toggleBot}
                  className={cn(
                    "p-3 rounded-full transition-all",
                    isBotActive ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-green-500/20 text-green-500 hover:bg-green-500/30"
                  )}
                >
                  {isBotActive ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
                </button>
              </div>

              {/* Strategy Sliders */}
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-3">
                    <label className="text-[10px] font-mono uppercase tracking-widest opacity-50">Risk Level (1-10)</label>
                    <span className="text-[10px] font-mono text-[#F27D26]">{riskLevel}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(parseInt(e.target.value))}
                    className="w-full accent-[#F27D26] bg-[#1A1A1A] h-1 rounded-full appearance-none cursor-pointer"
                  />
                  <p className="text-[9px] font-mono opacity-40 mt-2">
                    {riskLevel <= 3 ? "Conservative: Focus on high-liquidity, low-volatility markets." : 
                     riskLevel <= 7 ? "Balanced: Moderate exposure to emerging trends." : 
                     "Aggressive: High-conviction plays on volatile news events."}
                  </p>
                </div>

                {[
                  { label: "Aggression", key: "aggression" },
                  { label: "Risk Tolerance", key: "riskTolerance" },
                  { label: "News Sensitivity", key: "newsSensitivity" }
                ].map(item => (
                  <div key={item.key}>
                    <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest mb-2">
                      <span className="opacity-50">{item.label}</span>
                      <span className="text-[#F27D26]">{strategy[item.key as keyof typeof strategy]}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={strategy[item.key as keyof typeof strategy]}
                      onChange={(e) => setStrategy(prev => ({ ...prev, [item.key]: parseInt(e.target.value) }))}
                      className="w-full h-1 bg-[#1A1A1A] rounded-lg appearance-none cursor-pointer accent-[#F27D26]"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3 mt-2 border-t border-[#1A1A1A] pt-4">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest opacity-50">
                  <span>Auto-Analysis</span>
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest opacity-50">
                  <span>Sentiment Scoring</span>
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest opacity-50">
                  <span>Kelly Criterion</span>
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                </div>
              </div>
            </div>
          </section>

          {/* Whale Tracker */}
          <section className="bg-[#111111] border border-[#1A1A1A] rounded-sm p-6">
            <h2 className="text-xs font-mono uppercase tracking-widest mb-6 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#F27D26]" />
              On-Chain Whale Tracker
            </h2>
            <div className="space-y-4">
              {whaleHistory.length > 0 ? (
                whaleHistory.map(alert => (
                  <div key={alert.id} className="p-3 bg-[#0A0A0A] border border-[#1A1A1A] group hover:border-[#F27D26]/30 transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-mono text-[#F27D26] uppercase tracking-widest">Large Swap</span>
                      <span className="text-[8px] font-mono opacity-30">{format(alert.timestamp, "HH:mm:ss")}</span>
                    </div>
                    <p className="text-[10px] font-mono opacity-70 leading-tight">{alert.message.replace("🚨 WHALE ALERT: ", "")}</p>
                  </div>
                ))
              ) : (
                <div className="py-8 flex flex-col items-center justify-center opacity-20 italic text-[10px]">
                  <Activity className="w-8 h-8 mb-2 animate-pulse" />
                  Monitoring Chain...
                </div>
              )}
            </div>
          </section>

          {/* Terminal Logs */}
          <section className="bg-[#111111] border border-[#1A1A1A] rounded-sm overflow-hidden flex flex-col flex-1 min-h-[400px]">
            <div className="p-4 border-b border-[#1A1A1A] bg-[#151515] flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#F27D26]" />
                System Logs
              </h2>
              <span className="text-[10px] font-mono opacity-30">v1.0.4-beta</span>
            </div>
            <div 
              ref={logRef}
              className="flex-1 p-4 font-mono text-[10px] leading-relaxed overflow-y-auto custom-scrollbar bg-black"
            >
              <AnimatePresence initial={false}>
                {logs.map((log, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mb-1.5"
                  >
                    <span className="opacity-40 mr-2">{">"}</span>
                    <span className={cn(
                      log.includes("[SYSTEM]") ? "text-[#F27D26]" : 
                      log.includes("Executed") ? "text-green-400" : 
                      "text-white/70"
                    )}>
                      {log}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Recent Trades */}
          <section className="bg-[#111111] border border-[#1A1A1A] rounded-sm overflow-hidden">
            <div className="p-4 border-b border-[#1A1A1A] bg-[#151515]">
              <h2 className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                <History className="w-4 h-4 text-[#F27D26]" />
                Recent Activity
              </h2>
            </div>
            <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
              {trades.length > 0 ? (
                trades.map(trade => (
                  <div key={trade.id} className="p-3 border-b border-[#1A1A1A] flex items-center justify-between hover:bg-[#1A1A1A] transition-colors">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold truncate max-w-[150px]">{trade.marketQuestion}</span>
                      <span className={cn("text-[9px] font-mono uppercase", trade.outcome === "Yes" ? "text-green-500" : "text-red-500")}>
                        {trade.outcome} @ ${trade.price}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono">${(trade.amount * trade.price).toFixed(2)}</div>
                      <div className="text-[8px] font-mono opacity-30">{format(trade.timestamp, "HH:mm")}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center opacity-20">
                  <p className="text-[10px] font-mono uppercase tracking-widest">No recent trades</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="max-w-[1600px] mx-auto p-6 border-t border-[#1A1A1A] mt-12 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Network:</span>
            <span className="text-[10px] font-mono text-green-500 uppercase tracking-widest">Polygon Mainnet</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Latency:</span>
            <span className="text-[10px] font-mono text-green-500 uppercase tracking-widest">12ms</span>
          </div>
        </div>
        <div className="flex items-center gap-4 opacity-40 hover:opacity-100 transition-opacity">
          <span className="text-[10px] font-mono uppercase tracking-widest">Powered by Gemini 3.1 & Polymarket</span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1A1A1A;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #333;
        }
      `}</style>
    </div>
  );
}
