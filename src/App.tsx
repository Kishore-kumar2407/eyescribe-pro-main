import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Download, AlertTriangle, Eye, Keyboard, MessageSquare, ArrowLeft, ArrowUp, ArrowRight, ArrowDown, Moon, BellOff, Sparkles, AudioLines, Settings2, Edit, LogOut, User as UserIcon, HeartPulse, CheckCircle2, MonitorSmartphone } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { SetupWizard } from './components/SetupWizard';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type AppState = 'MAIN_MENU' | 'QUICK_PHRASES' | 'BINARY_KEYBOARD';
type Zone = 'CENTER' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | null;

interface Message {
  id: string;
  text: string;
  type: 'phrase' | 'keyboard' | 'sos';
  createdAt: string;
  createdBy: string;
}

export type SensitivityMode = 'High Precision' | 'Standard' | 'Rapid Input';

const getSensitivityValue = (mode: SensitivityMode) => {
  switch (mode) {
    case 'High Precision': return 1;
    case 'Standard': return 3;
    case 'Rapid Input': return 5;
  }
};

const getDwellTime = (z: Zone, mode: SensitivityMode) => {
  const sens = getSensitivityValue(mode);
  const base = z === 'CENTER' ? 1500 : 1000;
  return base + (3 - sens) * 250;
};
const SOS_TIME_MS = 3000;
const EAR_THRESHOLD = 0.25;

const ALPHABET = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 
  '_', '.'
];

const parsePhrase = (phrase: string) => {
  try {
    const regex = new RegExp('^([\\p{Emoji_Presentation}\\p{Extended_Pictographic}])\\s*(.*)$', 'u');
    const match = phrase.match(regex);
    if (match) {
      return { emoji: match[1], text: match[2] };
    }
  } catch (e) {}
  return { emoji: "💬", text: phrase };
};

const PHRASES = [
  // Needs
  "I NEED WATER", "I NEED HELP", "I NEED A NURSE", "I NEED MEDICINE", "I NEED SUCTION", 
  "I NEED TO USE THE BATHROOM", "I NEED TO REST", "I NEED TO SLEEP", "I NEED A DOCTOR",
  // Wants
  "I WANT TO SLEEP", "I WANT TO WATCH TV", "I WANT MY FAMILY", "I WANT TO SIT UP", 
  "I WANT TO LIE DOWN", "I WANT TO GO HOME", "I WANT FOOD", "I WANT WATER",
  // Feelings / States
  "I AM HUNGRY", "I AM THIRSTY", "I AM IN PAIN", "I AM COLD", "I AM HOT", "I AM TIRED", 
  "I AM OKAY", "I AM UNCOMFORTABLE", "I AM SCARED",
  "I FEEL SICK", "I FEEL DIZZY", "I FEEL BETTER", "I FEEL WEAK", "I CANNOT BREATHE",
  // Commands / Requests
  "CALL THE DOCTOR", "CALL THE NURSE", "CALL MY FAMILY",
  "TURN OFF THE LIGHTS", "TURN ON THE TV", "TURN ME OVER", "TURN OFF THE TV",
  "ADJUST MY BED", "ADJUST MY PILLOW", "MOVE MY LEGS", "MOVE MY ARMS",
  "PLEASE HELP ME", "PLEASE COME HERE", "PLEASE BE QUIET", "PLEASE WAIT",
  // Pain locations
  "MY HEAD HURTS", "MY BACK HURTS", "MY LEGS HURT", "MY ARMS HURT", "MY CHEST HURTS", 
  "MY STOMACH HURTS", "MY THROAT HURTS",
  // Questions
  "HOW ARE YOU", "HOW MUCH LONGER", "WHAT TIME IS IT", "WHERE IS THE DOCTOR", 
  "WHERE IS MY FAMILY", "WHEN CAN I GO HOME", "WHAT IS HAPPENING",
  // Social / Conversational
  "THANK YOU", "YES PLEASE", "NO THANK YOU", "HELLO", "GOOD MORNING", "GOOD NIGHT",
  "I LOVE YOU", "I MISS YOU"
];

const COMMON_WORDS = [
  "NURSE", "DOCTOR", "PAIN", "WATER", "HUNGRY", "THIRSTY", "BED", "PILLOW",
  "BATHROOM", "COLD", "HOT", "HELP", "PLEASE", "THANK", "YES", "NO", "FAMILY",
  "MEDICINE", "BREATHE", "SUCTION", "ITCH", "MOVE", "TURN", "COMFORTABLE",
  "TV", "LIGHTS", "QUIET", "SLEEP", "CALL", "WANT", "NEED", "AM", "FEEL", "FEELING",
  "HELLO", "HI", "HOW", "ARE", "GOODBYE", "OKAY", "OK", "THE", "BE", "TO", "OF",
  "AND", "A", "IN", "THAT", "HAVE", "I", "IT", "FOR", "NOT", "ON", "WITH", "HE",
  "AS", "YOU", "DO", "AT", "THIS", "BUT", "HIS", "BY", "FROM", "THEY", "WE", "SAY",
  "HER", "SHE", "OR", "AN", "WILL", "MY", "ONE", "ALL", "WOULD", "THERE", "THEIR",
  "WHAT", "SO", "UP", "OUT", "IF", "ABOUT", "WHO", "GET", "WHICH", "GO", "ME",
  "WHEN", "MAKE", "CAN", "LIKE", "TIME", "JUST", "HIM", "KNOW", "TAKE", "PEOPLE",
  "INTO", "YEAR", "YOUR", "GOOD", "SOME", "COULD", "THEM", "SEE", "OTHER", "THAN",
  "THEN", "NOW", "LOOK", "ONLY", "COME", "ITS", "OVER", "THINK", "ALSO"
];

const NEXT_WORD_PREDICTIONS: Record<string, string[]> = {
  "I": ["NEED", "AM", "WANT", "FEEL", "HAVE", "CAN", "LOVE"],
  "I AM": ["HUNGRY", "THIRSTY", "IN PAIN", "COLD", "HOT", "TIRED", "OKAY"],
  "I NEED": ["WATER", "HELP", "A", "MEDICINE", "SUCTION", "TO"],
  "I WANT": ["TO", "WATER", "MY", "TV"],
  "I FEEL": ["PAIN", "SICK", "BETTER", "COLD", "HOT", "TIRED"],
  "THE": ["NURSE", "DOCTOR", "BED", "PAIN", "LIGHTS", "TV"],
  "CALL": ["THE", "MY"],
  "TURN": ["OFF", "ON", "ME"],
  "MY": ["HEAD", "BACK", "LEGS", "ARMS", "FAMILY", "PAIN", "CHEST"],
  "PLEASE": ["HELP", "COME", "CALL", "TURN", "BE"],
  "HOW": ["ARE", "MUCH", "LONG"],
  "ARE": ["YOU", "THEY", "WE"],
  "THANK": ["YOU"],
  "DO": ["YOU", "NOT"],
  "CAN": ["YOU", "I"],
  "WHAT": ["TIME", "IS"],
  "WHERE": ["IS", "ARE"],
  "WHEN": ["CAN", "WILL"],
  "HELLO": ["THERE", "DOCTOR", "NURSE"],
  "GOOD": ["MORNING", "NIGHT", "EVENING"],
  "YES": ["PLEASE"],
  "NO": ["THANK"],
};

const KEYBOARD_CHUNKS = [
  ['E', 'T', 'A', 'O'],
  ['I', 'N', 'S', 'R'],
  ['H', 'D', 'L', 'U'],
  ['C', 'M', 'F', 'Y'],
  ['W', 'G', 'P', 'B'],
  ['V', 'K', 'X', 'Q'],
  ['J', 'Z', ' ', '.'],
];

const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

const getPrediction = (text: string) => {
  if (!text) return "I";
  
  const upperText = text.toUpperCase();
  const isTypingWord = text.length > 0 && !text.endsWith(' ');
  const words = text.trim().split(' ');
  const currentPartialWord = isTypingWord ? words[words.length - 1].toUpperCase() : "";
  
  const completedWords = isTypingWord ? words.slice(0, -1) : words;
  const completedText = completedWords.length > 0 ? completedWords.join(' ') + ' ' : '';

  // 1. Phrase Autocomplete (Google Style)
  const matchingPhrases = PHRASES.filter(p => p.startsWith(upperText));
  if (matchingPhrases.length > 0) {
    const bestPhrase = matchingPhrases[0];
    const remaining = bestPhrase.substring(completedText.length).trim();
    if (remaining) return remaining;
  }

  // 2. Next Word Prediction (if ending in space)
  if (!isTypingWord) {
    const lastWord = words[words.length - 1]?.toUpperCase();
    const lastTwo = words.length >= 2 ? words.slice(-2).join(' ').toUpperCase() : "";
    
    if (NEXT_WORD_PREDICTIONS[lastTwo]) return NEXT_WORD_PREDICTIONS[lastTwo][0];
    if (NEXT_WORD_PREDICTIONS[lastWord]) return NEXT_WORD_PREDICTIONS[lastWord][0];
    
    return "THE";
  }

  // 3. Partial Word Completion (if typing a word and no phrase matched)
  if (isTypingWord) {
    const match = COMMON_WORDS.find(w => w.startsWith(currentPartialWord));
    return match || currentPartialWord;
  }

  return "I";
};

export default function App() {
  const webcamRef = useRef<Webcam>(null);
  const [text, setText] = useState("");
  const [appState, setAppState] = useState<AppState>('MAIN_MENU');
  const [selectedPhrase, setSelectedPhrase] = useState<string | null>(null);
  
  const [zone, setZone] = useState<Zone>('CENTER');
  const [sosActive, setSosActive] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [mouseFallback, setMouseFallback] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showSetup, setShowSetup] = useState(() => localStorage.getItem('hasCompletedSetup') !== 'true');
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);

  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [snoozeDuration, setSnoozeDuration] = useState<number>(15);
  const [now, setNow] = useState(Date.now());
  const [aiPrediction, setAiPrediction] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityMode>('Standard');
  
  // Firebase Auth & Role State
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'patient' | 'caregiver' | null>(() => {
    return (localStorage.getItem('appRole') as 'patient' | 'caregiver' | null) || null;
  });
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [customPhrases, setCustomPhrases] = useState<string[]>(() => {
    const saved = localStorage.getItem('customPhrases');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 16) return parsed;
        // Migrate old object or array
        const oldArray = Array.isArray(parsed) ? parsed : [parsed.UP, parsed.DOWN, parsed.LEFT, parsed.RIGHT].filter(Boolean);
        const defaults = [
          "👋 Hello", "🙏 Thank you", "⭐ Great", "👍 OK", 
          "👂 What's your...", "🤨 How are you?", "🔁 Can you rep...", "❓ What's goin...",
          "✅ Yes", "❌ No", "🤷 Maybe", "🥺 Please", 
          "🆘 I need some...", "📺 TV please", "📻 Music please", "🚰 Water please"
        ];
        return [...oldArray, ...defaults].slice(0, 16);
      } catch (e) {}
    }
    return [
      "👋 Hello", "🙏 Thank you", "⭐ Great", "👍 OK", 
      "👂 What's your...", "🤨 How are you?", "🔁 Can you rep...", "❓ What's goin...",
      "✅ Yes", "❌ No", "🤷 Maybe", "🥺 Please", 
      "🆘 I need some...", "📺 TV please", "📻 Music please", "🚰 Water please"
    ];
  });
  const [isEditingPhrases, setIsEditingPhrases] = useState(false);
  const [tempPhrases, setTempPhrases] = useState<string[]>(customPhrases);
  const [activePhraseList, setActivePhraseList] = useState<string[]>([]);
  const [activeCharList, setActiveCharList] = useState<string[]>([]);

  const [caregiverPhone, setCaregiverPhone] = useState<string>(() => localStorage.getItem('caregiverPhone') || "");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [tempPhone, setTempPhone] = useState(caregiverPhone);
  const sirenAudioRef = useRef<{ audioCtx: AudioContext, osc: OscillatorNode, lfo: OscillatorNode } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);

  // Refs for state accessed in callbacks
  const stateRef = useRef(appState);
  const textRef = useRef(text);
  const zoneRef = useRef(zone);
  const sosRef = useRef(sosActive);
  const snoozeUntilRef = useRef(snoozeUntil);
  const aiPredictionRef = useRef(aiPrediction);
  const sensitivityRef = useRef(sensitivity);
  const customPhrasesRef = useRef(customPhrases);
  const activePhraseListRef = useRef(activePhraseList);
  const activeCharListRef = useRef(activeCharList);
  const caregiverPhoneRef = useRef(caregiverPhone);
  const showSetupRef = useRef(showSetup);
  
  const eyesClosedStartRef = useRef<number | null>(null);
  const sosBlinkCountRef = useRef(0);
  const lastSosBlinkTimeRef = useRef(0);
  const cooldownRef = useRef(0);
  const smoothedHDevRef = useRef(0);
  const smoothedVDevRef = useRef(0);
  const dwellStartRef = useRef<number | null>(null);

  useEffect(() => { stateRef.current = appState; }, [appState]);
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { zoneRef.current = zone; }, [zone]);
  useEffect(() => { sosRef.current = sosActive; }, [sosActive]);
  useEffect(() => { snoozeUntilRef.current = snoozeUntil; }, [snoozeUntil]);
  useEffect(() => { aiPredictionRef.current = aiPrediction; }, [aiPrediction]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { customPhrasesRef.current = customPhrases; }, [customPhrases]);
  useEffect(() => { activePhraseListRef.current = activePhraseList; }, [activePhraseList]);
  useEffect(() => { activeCharListRef.current = activeCharList; }, [activeCharList]);
  useEffect(() => { caregiverPhoneRef.current = caregiverPhone; }, [caregiverPhone]);
  useEffect(() => { showSetupRef.current = showSetup; }, [showSetup]);

  useEffect(() => {
    if (role === 'patient' && cameraStarted && user) {
      const pingInterval = setInterval(async () => {
        try {
          await setDoc(doc(db, 'sessions', 'default'), {
            sosActive: sosRef.current,
            updatedAt: new Date().toISOString(),
            updatedBy: user.uid,
            lastActiveAt: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.error("Failed to ping lastActiveAt", e);
        }
      }, 30000); // Ping every 30 seconds
      
      // Initial ping
      setDoc(doc(db, 'sessions', 'default'), {
        sosActive: sosRef.current,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        lastActiveAt: new Date().toISOString()
      }, { merge: true }).catch(console.error);

      return () => clearInterval(pingInterval);
    }
  }, [role, cameraStarted, user]);

  useEffect(() => {
    if (role === 'caregiver' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      
      if (messages.length > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0) {
        // Play notification sound for new messages (if not SOS, since SOS has siren)
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.type !== 'sos') {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
          osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); // A6
          gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.3);
        }
      }
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages, role]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleSosChange = useCallback(async (active: boolean) => {
    setSosActive(active);
    if (user) {
      try {
        await setDoc(doc(db, 'sessions', 'default'), {
          sosActive: active,
          updatedAt: new Date().toISOString(),
          updatedBy: user.uid
        });
        
        if (active) {
          await addDoc(collection(db, 'sessions', 'default', 'messages'), {
            text: "SOS EMERGENCY TRIGGERED",
            type: "sos",
            createdAt: new Date().toISOString(),
            createdBy: user.uid
          });
        }
      } catch (e) {
        console.error("Failed to sync SOS state", e);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user && role) {
      const unsubscribeSession = onSnapshot(doc(db, 'sessions', 'default'), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.sosActive !== sosRef.current) {
            setSosActive(data.sosActive);
          }
          if (data.lastActiveAt) {
            setLastActiveAt(data.lastActiveAt);
          }
        }
      });

      const q = query(collection(db, 'sessions', 'default', 'messages'), orderBy('createdAt', 'desc'), limit(50));
      const unsubscribeMessages = onSnapshot(q, (snapshot) => {
        const msgs: Message[] = [];
        snapshot.forEach((doc) => {
          msgs.push({ id: doc.id, ...doc.data() } as Message);
        });
        setMessages(msgs.reverse());
      });

      return () => {
        unsubscribeSession();
        unsubscribeMessages();
      };
    }
  }, [user, role]);

  useEffect(() => {
    if (sosActive) {
      // Start Siren
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 600;

        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 2; // 2 Hz siren

        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 200; // Frequency variation of +/- 200 Hz

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.5;

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        lfo.start();

        sirenAudioRef.current = { audioCtx, osc, lfo };
      } catch (e) {
        console.error("Failed to start siren", e);
      }

      // Send WhatsApp Message
      if (caregiverPhoneRef.current) {
        const message = encodeURIComponent("SOS EMERGENCY TRIGGERED! Please check on me immediately.");
        const url = `https://wa.me/${caregiverPhoneRef.current.replace(/\D/g, '')}?text=${message}`;
        window.open(url, '_blank');
      }
    } else {
      // Stop Siren
      if (sirenAudioRef.current) {
        try {
          sirenAudioRef.current.osc.stop();
          sirenAudioRef.current.lfo.stop();
          sirenAudioRef.current.audioCtx.close();
        } catch (e) {
          console.error("Failed to stop siren", e);
        }
        sirenAudioRef.current = null;
      }
    }
  }, [sosActive]);

  useEffect(() => {
    if (snoozeUntil || role === 'caregiver') {
      const interval = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [snoozeUntil, role]);

  // AI Prediction Effect
  const aiRateLimitUntil = useRef<number>(0);

  useEffect(() => {
    if (!text.trim()) {
      setAiPrediction(null);
      return;
    }
    
    setAiPrediction(null); // Clear immediately when text changes
    
    // If we are currently rate limited, don't make a request
    if (Date.now() < aiRateLimitUntil.current) {
      return;
    }
    
    const timer = setTimeout(async () => {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: `You are an AAC (Augmentative and Alternative Communication) text predictor. 
The user has typed: "${text}"
Provide the most likely completion. 
Rules:
1. Start with the exact text the user typed (completing the last word if it's partial).
2. Add 1-2 predicted next words.
3. Return ONLY the final uppercase string, no quotes, no punctuation.`,
          config: { temperature: 0.2 }
        });
        const prediction = response.text?.trim().toUpperCase();
        if (prediction && prediction !== text.trim().toUpperCase()) {
          setAiPrediction(prediction);
        }
      } catch (err: any) {
        if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
          console.warn("AI Prediction rate limit reached. Predictions temporarily disabled for 60 seconds.");
          aiRateLimitUntil.current = Date.now() + 60000; // Disable for 60 seconds
        } else {
          console.error("AI Prediction error", err);
        }
      }
    }, 1500); // Increased debounce to 1500ms to reduce API calls
    
    return () => clearTimeout(timer);
  }, [text]);

  const speak = useCallback(async (msg: string) => {
    if (!msg.trim()) return;
    
    // Use browser TTS directly to avoid API rate limits
    if (window.speechSynthesis) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(msg);
      utterance.rate = 0.9;
      
      // Try to find a good English voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith('en-') && (v.name.includes('Google') || v.name.includes('Natural')));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const logMessage = useCallback(async (msg: string, type: 'phrase' | 'keyboard') => {
    speak(msg);
    if (user && msg.trim()) {
      try {
        await addDoc(collection(db, 'sessions', 'default', 'messages'), {
          text: msg,
          type,
          createdAt: new Date().toISOString(),
          createdBy: user.uid
        });
      } catch (e) {
        console.error("Failed to log message", e);
      }
    }
  }, [speak, user]);

  const triggerAction = useCallback((z: Zone) => {
    const s = stateRef.current;
    if (s === 'MAIN_MENU') {
      if (z === 'UP') {
        if (aiPredictionRef.current) {
          setText(aiPredictionRef.current + ' ');
          setAiPrediction(null);
        } else {
          const prediction = getPrediction(textRef.current);
          if (prediction) {
            setText(prev => {
              if (prev.length > 0 && !prev.endsWith(' ')) {
                const words = prev.trim().split(' ');
                words.pop();
                return (words.length > 0 ? words.join(' ') + ' ' : '') + prediction + ' ';
              } else {
                return prev + prediction + ' ';
              }
            });
          }
        }
      }
      else if (z === 'LEFT') {
        setActivePhraseList(customPhrasesRef.current);
        setAppState('QUICK_PHRASES');
      }
      else if (z === 'RIGHT') {
        setActiveCharList(ALPHABET);
        setAppState('BINARY_KEYBOARD');
      }
      else if (z === 'DOWN') setText(prev => prev.slice(0, -1));
      else if (z === 'CENTER') {
        logMessage(textRef.current, 'keyboard');
        setText("");
      }
    } else if (s === 'QUICK_PHRASES') {
      const list = activePhraseListRef.current;
      if (list.length === 0) {
        setAppState('MAIN_MENU');
      } else {
        const mid = Math.ceil(list.length / 2);
        const leftHalf = list.slice(0, mid);
        const rightHalf = list.slice(mid);

        const handlePhraseSelect = (phrase: string) => {
          const parsedText = parsePhrase(phrase).text;
          logMessage(parsedText, 'phrase');
          setSelectedPhrase(parsedText);
          setAppState('MAIN_MENU');
          setTimeout(() => {
            setSelectedPhrase(null);
          }, 3000);
        };

        if (z === 'LEFT') {
          if (leftHalf.length === 1) {
            handlePhraseSelect(leftHalf[0]);
          } else if (leftHalf.length > 1) {
            setActivePhraseList(leftHalf);
          }
        } else if (z === 'RIGHT') {
          if (rightHalf.length === 1) {
            handlePhraseSelect(rightHalf[0]);
          } else if (rightHalf.length > 1) {
            setActivePhraseList(rightHalf);
          }
        } else if (z === 'UP') {
          if (list.length === customPhrasesRef.current.length) {
            setAppState('MAIN_MENU');
          } else {
            setActivePhraseList(customPhrasesRef.current);
          }
        } else if (z === 'CENTER') {
          setAppState('MAIN_MENU');
        }
      }
    } else if (s === 'BINARY_KEYBOARD') {
      const list = activeCharListRef.current;
      if (list.length === 0) {
        setAppState('MAIN_MENU');
      } else {
        const mid = Math.ceil(list.length / 2);
        const leftHalf = list.slice(0, mid);
        const rightHalf = list.slice(mid);

        if (z === 'LEFT') {
          if (leftHalf.length === 1) {
            setText(prev => prev + (leftHalf[0] === '_' ? ' ' : leftHalf[0]));
            setActiveCharList(ALPHABET); // Reset for next letter
          } else if (leftHalf.length > 1) {
            setActiveCharList(leftHalf);
          }
        } else if (z === 'RIGHT') {
          if (rightHalf.length === 1) {
            setText(prev => prev + (rightHalf[0] === '_' ? ' ' : rightHalf[0]));
            setActiveCharList(ALPHABET); // Reset for next letter
          } else if (rightHalf.length > 1) {
            setActiveCharList(rightHalf);
          }
        } else if (z === 'UP') {
          if (list.length === ALPHABET.length) {
            setAppState('MAIN_MENU');
          } else {
            setActiveCharList(ALPHABET);
          }
        } else if (z === 'DOWN') {
          // PREDICT action
          if (aiPredictionRef.current) {
            setText(aiPredictionRef.current + ' ');
            setAiPrediction(null);
            setAppState('MAIN_MENU');
          } else {
            const prediction = getPrediction(textRef.current);
            if (prediction) {
              setText(prev => {
                if (prev.length > 0 && !prev.endsWith(' ')) {
                  const words = prev.trim().split(' ');
                  words.pop();
                  return (words.length > 0 ? words.join(' ') + ' ' : '') + prediction + ' ';
                } else {
                  return prev + prediction + ' ';
                }
              });
              setAppState('MAIN_MENU');
            }
          }
        } else if (z === 'CENTER') {
          setAppState('MAIN_MENU');
        }
      }
    }
    
    cooldownRef.current = Date.now() + 500;
  }, [logMessage]);

  const onResults = useCallback((results: Results) => {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setZone('CENTER');
      eyesClosedStartRef.current = null;
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    
    // EAR Calculation
    const l_h = dist(landmarks[33], landmarks[133]);
    const l_v = dist(landmarks[159], landmarks[145]);
    const ear_l = l_h > 0 ? l_v / l_h : 0;
    
    const r_h = dist(landmarks[362], landmarks[263]);
    const r_v = dist(landmarks[386], landmarks[374]);
    const ear_r = r_h > 0 ? r_v / r_h : 0;
    
    const ear = (ear_l + ear_r) / 2.0;

    if (ear < EAR_THRESHOLD) {
      if (eyesClosedStartRef.current === null) {
        eyesClosedStartRef.current = Date.now();
      } else if (Date.now() - eyesClosedStartRef.current >= SOS_TIME_MS) {
        const isSnoozed = snoozeUntilRef.current !== null && Date.now() < snoozeUntilRef.current;
        if (!sosRef.current && !isSnoozed) {
          handleSosChange(true);
          speak("SOS EMERGENCY TRIGGERED");
        }
      }
      // Skip gaze detection while eyes are closed to prevent erratic zone changes
      return;
    } else {
      if (eyesClosedStartRef.current !== null) {
        const closedDuration = Date.now() - eyesClosedStartRef.current;
        // Detect a blink (between 50ms and 800ms)
        if (closedDuration > 50 && closedDuration < 800) {
          if (sosRef.current) {
            // Handle SOS dismiss blink
            const now = Date.now();
            if (now - lastSosBlinkTimeRef.current > 2000) {
              // Reset if more than 2 seconds between blinks
              sosBlinkCountRef.current = 1;
            } else {
              sosBlinkCountRef.current += 1;
            }
            lastSosBlinkTimeRef.current = now;

            if (sosBlinkCountRef.current >= 3) {
              handleSosChange(false);
              sosBlinkCountRef.current = 0;
            }
          } else {
            // Normal blink action
            if (Date.now() >= cooldownRef.current) {
              if (!showSetupRef.current) {
                triggerAction(zoneRef.current);
              }
              setZone('CENTER');
              zoneRef.current = 'CENTER';
              dwellStartRef.current = null;
            }
          }
        }
      }
      eyesClosedStartRef.current = null;
    }

    if (sosRef.current) return;

    // Gaze Detection using BOTH eyes for stability
    const l_lc = landmarks[33];
    const l_rc = landmarks[133];
    const l_iris = landmarks[468]; // Left iris center

    const r_lc = landmarks[362];
    const r_rc = landmarks[263];
    const r_iris = landmarks[473]; // Right iris center

    const l_h_dist = dist(l_lc, l_rc);
    const r_h_dist = dist(r_lc, r_rc);

    let currentGaze: Zone = 'CENTER';
    if (l_h_dist > 0 && r_h_dist > 0) {
      const l_eye_center_x = (l_lc.x + l_rc.x) / 2.0;
      const l_eye_center_y = (l_lc.y + l_rc.y) / 2.0;
      
      const r_eye_center_x = (r_lc.x + r_rc.x) / 2.0;
      const r_eye_center_y = (r_lc.y + r_rc.y) / 2.0;

      const l_raw_h_dev = (l_iris.x - l_eye_center_x) / l_h_dist;
      const r_raw_h_dev = (r_iris.x - r_eye_center_x) / r_h_dist;
      
      // Add +0.06 offset because the iris is naturally tracked higher than the eye corners
      const l_raw_v_dev = (l_iris.y - l_eye_center_y) / l_h_dist + 0.06;
      const r_raw_v_dev = (r_iris.y - r_eye_center_y) / r_h_dist + 0.06;

      // Average the two eyes to eliminate jitter
      const raw_h_dev = (l_raw_h_dev + r_raw_h_dev) / 2.0;
      const raw_v_dev = (l_raw_v_dev + r_raw_v_dev) / 2.0;

      // Heavy smoothing to prevent flickering
      smoothedHDevRef.current = smoothedHDevRef.current * 0.85 + raw_h_dev * 0.15;
      smoothedVDevRef.current = smoothedVDevRef.current * 0.85 + raw_v_dev * 0.15;

      const h_dev = smoothedHDevRef.current;
      const v_dev = smoothedVDevRef.current;

      // Wider thresholds to prevent accidental triggers
      const sensValue = getSensitivityValue(sensitivityRef.current);
      const multiplier = 1 + (3 - sensValue) * 0.25;
      const H_THRESH = 0.08 * multiplier;
      const V_THRESH_UP = -0.05 * multiplier;  // Harder to trigger UP
      const V_THRESH_DOWN = 0.02 * multiplier; // Very easy to trigger DOWN

      const h_active = Math.abs(h_dev) > H_THRESH;
      const v_active = v_dev < V_THRESH_UP || v_dev > V_THRESH_DOWN;

      if (h_active || v_active) {
        const h_mag = Math.abs(h_dev) / H_THRESH;
        const v_mag = v_dev < 0 ? (v_dev / V_THRESH_UP) : (v_dev / V_THRESH_DOWN);

        // Require a clear winner to avoid diagonal jitter
        if (h_mag > v_mag * 1.2) {
          currentGaze = h_dev > 0 ? 'LEFT' : 'RIGHT'; // Mirrored
        } else if (v_mag > h_mag * 1.2) {
          currentGaze = v_dev < 0 ? 'UP' : 'DOWN';
        }
      }
    }

    // Only update gaze if not in cooldown
    if (Date.now() >= cooldownRef.current) {
      if (currentGaze !== zoneRef.current) {
        setZone(currentGaze);
        zoneRef.current = currentGaze;
        dwellStartRef.current = Date.now();
      } else if (currentGaze !== 'CENTER') {
        // Check dwell time for non-center zones
        if (dwellStartRef.current !== null && Date.now() - dwellStartRef.current >= getDwellTime(currentGaze, sensitivityRef.current)) {
          if (!showSetupRef.current) {
            triggerAction(currentGaze);
          }
          setZone('CENTER');
          zoneRef.current = 'CENTER';
          dwellStartRef.current = null;
        }
      } else {
        // Reset dwell time if looking at center
        dwellStartRef.current = null;
      }
    }
  }, [triggerAction, speak]);

  const requestRef = useRef<number>();
  const faceMeshRef = useRef<FaceMesh | null>(null);

  useEffect(() => {
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);
    faceMeshRef.current = faceMesh;

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      faceMesh.close();
    };
  }, [onResults]);

  const processVideo = async () => {
    if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
      try {
        await faceMeshRef.current?.send({ image: webcamRef.current.video });
        setIsLoaded(prev => {
          if (!prev) return true;
          return prev;
        });
      } catch (err) {
        console.error("FaceMesh processing error:", err);
      }
    }
    requestRef.current = requestAnimationFrame(processVideo);
  };

  const handleUserMedia = (stream: MediaStream) => {
    setCameraStream(stream);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = requestAnimationFrame(processVideo);
  };

  const getLabels = () => {
    if (appState === 'MAIN_MENU') {
      let upLabel = "PREDICT";
      if (aiPrediction) {
        upLabel = `✨\n${aiPrediction}`;
      } else {
        const localPred = getPrediction(text);
        upLabel = localPred ? `PREDICT:\n${localPred}` : "PREDICT";
      }
      return {
        UP: upLabel,
        LEFT: "QUICK\nPHRASES",
        RIGHT: "KEYBOARD",
        DOWN: "BACKSPACE",
        CENTER: "SPEAK\n&\nCLEAR"
      };
    }
    if (appState === 'QUICK_PHRASES') {
      const list = activePhraseList;
      const mid = Math.ceil(list.length / 2);
      const leftHalf = list.slice(0, mid);
      const rightHalf = list.slice(mid);

      return {
        UP: list.length === customPhrases.length ? "BACK TO\nMENU" : "RESET\nPHRASES",
        DOWN: "",
        LEFT: leftHalf.join('\n'),
        RIGHT: rightHalf.join('\n'),
        CENTER: "BACK"
      };
    }
    if (appState === 'BINARY_KEYBOARD') {
      const list = activeCharList;
      const mid = Math.ceil(list.length / 2);
      const leftHalf = list.slice(0, mid);
      const rightHalf = list.slice(mid);

      let downLabel = "PREDICT";
      if (aiPrediction) {
        downLabel = `✨\n${aiPrediction}`;
      } else {
        const localPred = getPrediction(text);
        downLabel = localPred ? `PREDICT:\n${localPred}` : "PREDICT";
      }

      return {
        UP: list.length === ALPHABET.length ? "BACK TO\nMENU" : "RESET\nKEYBOARD",
        DOWN: downLabel,
        LEFT: leftHalf.join(' '),
        RIGHT: rightHalf.join(' '),
        CENTER: "BACK"
      };
    }
    return {};
  };

  const labels = getLabels();

  const ZoneBox = ({ id, label, className }: { id: Zone, label: string, className: string }) => {
    const isActive = zone === id;
    const lines = label.split('\n');
    const dwellTime = getDwellTime(id, sensitivity);
    
    return (
      <motion.div 
        onClick={() => {
          if (mouseFallback) {
            triggerAction(id);
          }
        }}
        className={`relative flex flex-col items-center justify-center border-4 transition-colors duration-150 overflow-hidden shadow-lg ${isActive ? 'bg-zinc-800 border-emerald-500 shadow-emerald-500/20' : 'bg-zinc-900 border-zinc-800'} ${className} ${mouseFallback ? 'cursor-pointer hover:bg-zinc-800' : ''}`}
        animate={{ scale: isActive ? 1.02 : 1 }}
        transition={{ duration: 0.2 }}
      >
        <div 
          className="absolute top-0 left-0 h-full bg-emerald-500/30 pointer-events-none z-0 backdrop-blur-sm"
          style={{
            width: isActive ? '100%' : '0%',
            transition: isActive ? `width ${dwellTime}ms linear` : 'width 0s'
          }}
        />
        <div className="relative z-10 flex flex-col items-center justify-center gap-0.5 sm:gap-2 w-full px-1">
          {lines.map((line, i) => (
            <span key={i} className={`${lines.length > 1 ? 'text-[11px] min-[380px]:text-sm sm:text-xl md:text-2xl' : 'text-[13px] min-[380px]:text-base sm:text-2xl md:text-3xl'} font-black tracking-tight text-white text-center px-0.5 sm:px-4 whitespace-pre-line drop-shadow-md break-words max-w-full leading-tight`}>
              {line}
            </span>
          ))}
          {isActive && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-0.5 sm:mt-2 text-emerald-400 font-mono text-[9px] min-[380px]:text-[10px] sm:text-sm uppercase tracking-wider sm:tracking-widest font-bold"
            >
              Selecting...
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#282828] text-white flex flex-col items-center justify-center p-8">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-xl text-zinc-400">Loading EyeScribe Pro...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8 text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <Eye className="w-24 h-24 text-emerald-500 mb-8 mx-auto drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
        </motion.div>
        <h1 className="text-5xl font-black mb-6 tracking-tight">Welcome to EyeScribe Pro</h1>
        <p className="text-xl text-zinc-400 max-w-2xl mb-12 font-medium">
          Sign in to connect the Patient interface with the Caregiver Dashboard for real-time SOS alerts and communication.
        </p>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => signInWithPopup(auth, googleProvider)}
          className="px-8 py-4 bg-white text-zinc-900 font-bold rounded-2xl text-xl hover:bg-zinc-200 transition-colors shadow-xl flex items-center gap-3"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
          Sign in with Google
        </motion.button>
      </motion.div>
    );
  }

  if (!role) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8 text-center"
      >
        <h1 className="text-5xl font-black mb-16 tracking-tight">Who is using this device?</h1>
        <div className="flex flex-col md:flex-row gap-8 max-w-4xl w-full">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setRole('patient');
              localStorage.setItem('appRole', 'patient');
              setHasInteracted(true);
            }}
            className="flex-1 bg-zinc-900/80 border-2 border-zinc-800 hover:border-emerald-500 p-12 rounded-[2rem] flex flex-col items-center transition-colors group shadow-xl"
          >
            <Eye className="w-24 h-24 text-emerald-500 mb-8 group-hover:scale-110 transition-transform duration-300" />
            <h2 className="text-3xl font-bold mb-4">I am the Patient</h2>
            <p className="text-zinc-400 text-lg">Use eye tracking to communicate and trigger SOS alerts.</p>
          </motion.button>
          
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setRole('caregiver');
              localStorage.setItem('appRole', 'caregiver');
            }}
            className="flex-1 bg-zinc-900/80 border-2 border-zinc-800 hover:border-amber-500 p-12 rounded-[2rem] flex flex-col items-center transition-colors group shadow-xl"
          >
            <HeartPulse className="w-24 h-24 text-amber-500 mb-8 group-hover:scale-110 transition-transform duration-300" />
            <h2 className="text-3xl font-bold mb-4">I am the Caregiver</h2>
            <p className="text-zinc-400 text-lg">Monitor the patient and receive instant SOS alerts.</p>
          </motion.button>
        </div>
        <button 
          onClick={() => signOut(auth)}
          className="mt-16 text-zinc-500 hover:text-zinc-300 flex items-center gap-2 font-medium transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </motion.div>
    );
  }

  if (role === 'patient' && !hasInteracted) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8 text-center cursor-pointer"
        onClick={() => {
          setHasInteracted(true);
          // Initialize speech synthesis on user interaction
          if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance("");
            window.speechSynthesis.speak(utterance);
          }
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Eye className="w-32 h-32 text-emerald-500 mb-10 drop-shadow-[0_0_20px_rgba(16,185,129,0.6)]" />
        </motion.div>
        <h1 className="text-6xl font-black mb-6 tracking-tight">Ready to Start</h1>
        <p className="text-2xl text-zinc-400 max-w-2xl mb-16 font-medium">
          Click anywhere on the screen to enable audio and start eye tracking.
        </p>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-12 py-6 bg-emerald-600 text-white font-black rounded-3xl text-2xl hover:bg-emerald-500 transition-colors shadow-[0_0_30px_rgba(16,185,129,0.4)]"
        >
          Start EyeScribe Pro
        </motion.button>
      </motion.div>
    );
  }

  if (role === 'caregiver') {
    return (
      <div className="min-h-screen bg-[#1e1e1e] text-white flex flex-col font-sans">
        {/* Caregiver Header */}
        <div className="bg-[#0a0a0a] border-b border-zinc-800/50 p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm relative z-20">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500/10 rounded-xl sm:rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-inner shrink-0">
              <HeartPulse className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Caregiver Dashboard</h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-2 sm:gap-3 text-zinc-300 bg-zinc-900/80 border border-zinc-800 px-3 py-2 sm:px-5 sm:py-2.5 rounded-full shadow-inner backdrop-blur-sm truncate max-w-[200px] sm:max-w-none">
              <UserIcon className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-xs sm:text-sm font-medium tracking-wide truncate">{user.email}</span>
            </div>
            <motion.button 
              whileHover={{ scale: 1.05, rotate: 15 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setRole(null);
                localStorage.removeItem('appRole');
              }}
              className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 rounded-full transition-colors shadow-sm shrink-0"
              title="Switch Role"
            >
              <Settings2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
          </div>
        </div>

        {/* Caregiver Main Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#0a0a0a]">
          {/* Left Side: Status & SOS */}
          <div className="w-full md:w-1/3 p-6 flex flex-col border-r border-zinc-800/50 bg-[#121212]">
            <AnimatePresence mode="wait">
              {sosActive ? (
                <motion.div 
                  key="sos"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex-1 bg-red-600 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-[0_0_80px_rgba(220,38,38,0.4)] relative overflow-hidden"
                >
                  <motion.div 
                    animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                    transition={{ repeat: Infinity, duration: 0.5 }}
                  >
                    <AlertTriangle className="w-24 h-24 text-white mb-6 drop-shadow-lg" />
                  </motion.div>
                  <h2 className="text-5xl font-black text-white mb-4 tracking-tight">EMERGENCY</h2>
                  <p className="text-xl text-red-100 mb-10 font-medium">The patient has triggered an SOS alert!</p>
                  <button 
                    onClick={() => handleSosChange(false)}
                    className="px-8 py-5 bg-white text-red-600 font-black rounded-2xl text-xl hover:bg-zinc-100 transition-all shadow-xl w-full active:scale-95 uppercase tracking-widest"
                  >
                    Dismiss Alert
                  </button>
                </motion.div>
              ) : (
                <motion.div 
                  key="monitoring"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-inner"
                >
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-8 transition-colors duration-500 ${lastActiveAt && (now - new Date(lastActiveAt).getTime() < 60000) ? 'bg-emerald-500/10' : 'bg-zinc-800/50'}`}>
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-colors duration-500 ${lastActiveAt && (now - new Date(lastActiveAt).getTime() < 60000) ? 'bg-emerald-500/20' : 'bg-zinc-700/50'}`}>
                      <HeartPulse className={`w-12 h-12 transition-colors duration-500 ${lastActiveAt && (now - new Date(lastActiveAt).getTime() < 60000) ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
                    </div>
                  </div>
                  <h2 className={`text-3xl font-black mb-3 tracking-tight ${lastActiveAt && (now - new Date(lastActiveAt).getTime() < 60000) ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {lastActiveAt && (now - new Date(lastActiveAt).getTime() < 60000) ? 'Patient Online' : 'Patient Offline'}
                  </h2>
                  <p className="text-zinc-500 text-lg font-medium">
                    {lastActiveAt && (now - new Date(lastActiveAt).getTime() >= 60000) ? `Last active: ${new Date(lastActiveAt).toLocaleTimeString()}` : 'Monitoring active. Leave this screen open.'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Side: Message History */}
          <div className="flex-1 flex flex-col bg-[#0a0a0a] relative">
            <div className="p-6 border-b border-zinc-800/50 flex items-center gap-4 bg-[#0a0a0a] z-10 shadow-sm">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                <MessageSquare className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white">Message History</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6 relative bg-gradient-to-b from-[#0a0a0a] to-[#121212]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                  <MessageSquare className="w-20 h-20 mb-6 opacity-10" />
                  <p className="text-xl font-medium tracking-wide">No messages yet.</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div 
                      key={msg.id} 
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={`p-6 rounded-[2rem] max-w-[85%] shadow-lg ${msg.type === 'sos' ? 'bg-red-950/40 border border-red-900/50 mr-auto rounded-tl-xl' : 'bg-zinc-900/80 border border-zinc-800/80 ml-auto rounded-tr-xl backdrop-blur-md'}`}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        {msg.type === 'sos' ? (
                          <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          </div>
                        ) : msg.type === 'phrase' ? (
                          <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                            <Keyboard className="w-4 h-4 text-blue-400" />
                          </div>
                        )}
                        <span className="text-sm text-zinc-500 font-mono tracking-widest font-bold uppercase">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className={`text-2xl leading-relaxed ${msg.type === 'sos' ? 'text-red-200 font-black tracking-wide' : 'text-zinc-100 font-medium'}`}>
                        {msg.text}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cameraError) {
    return (
      <div className="min-h-screen bg-[#282828] text-white flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="w-24 h-24 text-red-500 mb-6" />
        <h1 className="text-4xl font-bold mb-4">Camera Access Denied</h1>
        <p className="text-xl text-zinc-400 max-w-2xl mb-8">
          EyeScribe Pro requires camera access to track your eye movements. 
          Please allow camera permissions in your browser settings and refresh the page.
        </p>
        <p className="text-red-400 bg-red-900/20 p-4 rounded-lg border border-red-900/50 mb-8">
          Error: {cameraError}
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={() => {
              setCameraError(null);
              setCameraStarted(false);
            }}
            className="px-8 py-4 bg-amber-500 text-black font-bold rounded-xl text-xl hover:bg-amber-400 transition-colors"
          >
            Try Again
          </button>
          <button 
            onClick={() => {
              setCameraError(null);
              setMouseFallback(true);
              setCameraStarted(true);
            }}
            className="px-8 py-4 bg-zinc-700 text-white font-bold rounded-xl text-xl hover:bg-zinc-600 transition-colors"
          >
            Continue with Mouse Fallback
          </button>
        </div>
      </div>
    );
  }

  if (!cameraStarted) {
    return (
      <div className="min-h-screen bg-[#282828] text-white flex flex-col items-center justify-center p-8 text-center">
        <Eye className="w-24 h-24 text-amber-500 mb-6" />
        <h1 className="text-4xl font-bold mb-4">Welcome to EyeScribe Pro</h1>
        <p className="text-xl text-zinc-400 max-w-2xl mb-12">
          This application uses your webcam to track your eye movements, allowing you to communicate without using your hands.
        </p>
        <button 
          onClick={() => setCameraStarted(true)}
          className="px-8 py-4 bg-emerald-600 text-white font-bold rounded-xl text-xl hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/50"
        >
          Start Camera & Eye Tracking
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden font-sans">
      {showSetup && (
        <SetupWizard
          stream={cameraStream}
          zone={zone}
          onComplete={() => {
            setShowSetup(false);
            localStorage.setItem('hasCompletedSetup', 'true');
          }}
        />
      )}
      {sosActive && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-red-600 flex flex-col items-center justify-center z-[200] p-4"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            <AlertTriangle className="w-24 h-24 sm:w-40 sm:h-40 text-white mb-6 sm:mb-10 drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]" />
          </motion.div>
          <h1 className="text-4xl sm:text-7xl font-black text-white text-center mb-8 sm:mb-16 tracking-tighter drop-shadow-xl">SOS EMERGENCY TRIGGERED</h1>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSosChange(false)}
            className="px-6 py-4 sm:px-10 sm:py-6 bg-white text-red-600 font-black rounded-2xl sm:rounded-3xl text-xl sm:text-3xl hover:bg-zinc-200 transition-colors shadow-[0_0_40px_rgba(255,255,255,0.3)] text-center"
          >
            Dismiss SOS<br className="sm:hidden" /> (or blink 3 times)
          </motion.button>
        </motion.div>
      )}

      {/* Top Bar for Caregiver Controls */}
      <div className="w-full z-50 flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-4 bg-[#1a1a1a]/90 backdrop-blur-md p-2 sm:p-4 border-b border-zinc-800 shadow-xl">
        <button
          onClick={() => {
            setRole(null);
            localStorage.removeItem('appRole');
          }}
          className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition-colors border border-zinc-700 text-[10px] sm:text-xs font-bold uppercase tracking-wider"
          title="Switch Role"
        >
          <UserIcon className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden xs:inline">Switch Role</span>
          <span className="inline xs:hidden">Role</span>
        </button>

        <button
          onClick={() => {
            setShowSetup(true);
          }}
          className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition-colors border border-zinc-700 text-[10px] sm:text-xs font-bold uppercase tracking-wider"
          title="Setup Helper"
        >
          <MonitorSmartphone className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden xs:inline">Setup Helper</span>
          <span className="inline xs:hidden">Setup</span>
        </button>

        <button
          onClick={() => {
            setTempPhrases(customPhrases);
            setIsEditingPhrases(true);
          }}
          className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition-colors border border-zinc-700 text-[10px] sm:text-xs font-bold uppercase tracking-wider"
          title="Edit Quick Phrases"
        >
          <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
          Phrases
        </button>

        <div className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-zinc-800/80 rounded-xl border border-zinc-700">
          <Settings2 className="w-3 h-3 sm:w-4 sm:h-4 text-zinc-400" />
          <select
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as SensitivityMode)}
            className="bg-transparent text-zinc-300 text-[10px] sm:text-xs font-bold outline-none cursor-pointer"
            title="Adjust gaze sensitivity mode"
          >
            <option value="High Precision">High Prec.</option>
            <option value="Standard">Standard</option>
            <option value="Rapid Input">Rapid</option>
          </select>
        </div>
        
        {snoozeUntil && now < snoozeUntil ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/80 rounded-xl border border-zinc-700">
            <div className="text-amber-400 font-bold flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
              <Moon className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">SOS Snoozed: </span>{Math.ceil((snoozeUntil - now) / 60000)}m
            </div>
            <button 
              onClick={() => setSnoozeUntil(null)}
              className="px-2 py-1 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-[10px] sm:text-xs font-bold uppercase tracking-wider ml-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 bg-zinc-800/80 rounded-xl border border-zinc-700">
            <select 
              value={snoozeDuration} 
              onChange={(e) => setSnoozeDuration(Number(e.target.value))}
              className="bg-transparent text-zinc-300 text-[10px] sm:text-xs font-bold outline-none cursor-pointer"
            >
              <option value={5}>5m</option>
              <option value={15}>15m</option>
              <option value={30}>30m</option>
              <option value={60}>1h</option>
              <option value={120}>2h</option>
              <option value={480}>8h</option>
            </select>
            <button 
              onClick={() => {
                setSnoozeUntil(Date.now() + snoozeDuration * 60000);
                setNow(Date.now());
              }}
              className="flex items-center gap-1 sm:gap-2 px-2 py-1 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors text-[10px] sm:text-xs font-bold uppercase tracking-wider ml-1"
            >
              <BellOff className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Snooze SOS</span>
              <span className="inline sm:hidden">Snooze</span>
            </button>
          </div>
        )}
      </div>

      {/* Header & Text Box */}
      <div className="min-h-[10rem] h-auto bg-[#121212] border-b-2 border-zinc-800 p-4 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-2xl z-10 gap-4">
        <div className="flex-1 w-full overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-4 mb-2 sm:mb-3">
            <p className="text-zinc-500 text-xs sm:text-sm font-mono uppercase tracking-[0.2em] font-bold">Typed Text</p>
            <div className="flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1 bg-zinc-800/50 rounded-full border border-zinc-700/50">
              <Settings2 className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] sm:text-xs font-bold text-zinc-400 tracking-wider uppercase">{sensitivity} Mode</span>
            </div>
          </div>
          <div className="text-4xl sm:text-6xl font-black tracking-tight truncate text-white drop-shadow-md">
            {text || <span className="text-zinc-700">...</span>}
            <span className="animate-pulse text-emerald-500 ml-1">|</span>
          </div>
        </div>
        <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <motion.a 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            href="/eyescribe_pro.py" 
            download 
            className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 sm:px-5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-colors border border-zinc-700 shadow-lg text-zinc-300 hover:text-white flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden xs:inline">Download Script</span>
            <span className="inline xs:hidden">Script</span>
          </motion.a>
          {!isLoaded && (
            <div className="flex items-center justify-center gap-2 sm:gap-3 text-amber-500 text-xs sm:text-sm font-bold bg-amber-500/10 px-3 py-2 sm:px-4 sm:py-2 rounded-lg border border-amber-500/20 flex-1 sm:flex-none">
              <div className="w-3 h-3 sm:w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span className="hidden xs:inline">Loading Face Mesh...</span>
              <span className="inline xs:hidden">Loading...</span>
            </div>
          )}
        </div>
      </div>

      {/* Main UI */}
      <AnimatePresence mode="wait">
        {appState === 'QUICK_PHRASES' || appState === 'BINARY_KEYBOARD' ? (
          <motion.div 
            key="split-view"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col bg-[#0a0a0a] relative overflow-hidden"
          >
            {/* Top Bar */}
            <div className="h-16 sm:h-20 flex items-center justify-center border-b border-zinc-800 bg-[#121212] relative overflow-hidden">
              <motion.div 
                className="absolute top-0 left-0 h-full bg-emerald-500/30 pointer-events-none z-0 backdrop-blur-sm"
                animate={{ width: zone === 'UP' ? '100%' : '0%' }}
                transition={{ duration: zone === 'UP' ? getDwellTime('UP', sensitivity) / 1000 : 0, ease: "linear" }}
              />
              <div className={`relative z-10 flex items-center gap-2 sm:gap-4 px-4 py-2 sm:px-8 sm:py-3 rounded-full border-2 transition-colors ${zone === 'UP' ? 'bg-zinc-800 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-zinc-900 border-zinc-700'}`}>
                <span className="text-zinc-500 font-bold tracking-[0.2em] text-xs sm:text-sm">LOOK UP TO</span>
                <span className="text-white font-black tracking-widest text-base sm:text-lg">
                  {appState === 'QUICK_PHRASES' 
                    ? (activePhraseList.length === customPhrases.length ? "GO BACK" : "RESET")
                    : (activeCharList.length === ALPHABET.length ? "GO BACK" : "RESET")}
                </span>
                <div className="flex items-center gap-1 text-zinc-400">
                  <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                  <ArrowUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
            </div>

          {/* Main Content */}
          <div className="flex-1 flex relative min-h-0">
            {/* Vertical Divider */}
            <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-zinc-800 -translate-x-1/2 z-10" />

            {/* Left Column */}
            <div className={`flex-1 flex flex-col p-2 sm:p-6 transition-colors relative overflow-hidden ${zone === 'LEFT' ? 'bg-zinc-900/50' : ''}`}>
              <motion.div 
                className="absolute top-0 left-0 h-full bg-emerald-500/20 pointer-events-none z-0 backdrop-blur-sm"
                animate={{ width: zone === 'LEFT' ? '100%' : '0%' }}
                transition={{ duration: zone === 'LEFT' ? getDwellTime('LEFT', sensitivity) / 1000 : 0, ease: "linear" }}
              />
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center gap-2 sm:gap-4 mb-4 sm:mb-8">
                  <ArrowLeft className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-500" />
                  <div className="text-zinc-400 text-lg sm:text-2xl font-black uppercase tracking-[0.2em]">Look left</div>
                </div>
                {appState === 'QUICK_PHRASES' ? (
                  <div className="flex-1 flex flex-col gap-2 sm:gap-3 overflow-y-auto pr-1 pb-2">
                    {activePhraseList.slice(0, Math.ceil(activePhraseList.length / 2)).map((phrase, i) => {
                      const { emoji, text } = parsePhrase(phrase);
                      return (
                        <div key={i} className="bg-[#1a1a1a] rounded-xl sm:rounded-2xl p-3 sm:p-5 flex items-center gap-3 sm:gap-5 shadow-lg border border-zinc-800 shrink-0">
                          <span className="text-3xl sm:text-5xl drop-shadow-md">{emoji}</span>
                          <span className="text-lg sm:text-2xl text-white font-bold truncate">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4 content-start justify-items-center overflow-y-auto pr-1 pb-2">
                    {activeCharList.slice(0, Math.ceil(activeCharList.length / 2)).map((char, i) => (
                      <div key={i} className="bg-[#1a1a1a] rounded-lg sm:rounded-2xl w-full aspect-square max-w-[3rem] sm:max-w-[4rem] md:max-w-[5rem] flex items-center justify-center shadow-lg border border-zinc-800 text-lg sm:text-3xl md:text-4xl font-black text-white">
                        {char === '_' ? '␣' : char}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className={`flex-1 flex flex-col p-2 sm:p-6 transition-colors relative overflow-hidden ${zone === 'RIGHT' ? 'bg-zinc-900/50' : ''}`}>
              <motion.div 
                className="absolute top-0 right-0 h-full bg-emerald-500/20 pointer-events-none z-0 backdrop-blur-sm"
                animate={{ width: zone === 'RIGHT' ? '100%' : '0%' }}
                transition={{ duration: zone === 'RIGHT' ? getDwellTime('RIGHT', sensitivity) / 1000 : 0, ease: "linear" }}
              />
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-end gap-2 sm:gap-4 mb-4 sm:mb-8">
                  <div className="text-zinc-400 text-lg sm:text-2xl font-black uppercase tracking-[0.2em]">Look right</div>
                  <ArrowRight className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-500" />
                </div>
                {appState === 'QUICK_PHRASES' ? (
                  <div className="flex-1 flex flex-col gap-2 sm:gap-3 overflow-y-auto pr-1 pb-2">
                    {activePhraseList.slice(Math.ceil(activePhraseList.length / 2)).map((phrase, i) => {
                      const { emoji, text } = parsePhrase(phrase);
                      return (
                        <div key={i} className="bg-[#1a1a1a] rounded-xl sm:rounded-2xl p-3 sm:p-5 flex items-center gap-3 sm:gap-5 shadow-lg border border-zinc-800 shrink-0">
                          <span className="text-3xl sm:text-5xl drop-shadow-md">{emoji}</span>
                          <span className="text-lg sm:text-2xl text-white font-bold truncate">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4 content-start justify-items-center overflow-y-auto pr-1 pb-2">
                    {activeCharList.slice(Math.ceil(activeCharList.length / 2)).map((char, i) => (
                      <div key={i} className="bg-[#1a1a1a] rounded-lg sm:rounded-2xl w-full aspect-square max-w-[3rem] sm:max-w-[4rem] md:max-w-[5rem] flex items-center justify-center shadow-lg border border-zinc-800 text-lg sm:text-3xl md:text-4xl font-black text-white">
                        {char === '_' ? '␣' : char}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Bar for Keyboard Predict */}
          {appState === 'BINARY_KEYBOARD' && (
            <div className="h-16 sm:h-20 flex items-center justify-center border-t border-zinc-800 bg-[#121212] relative overflow-hidden">
              <motion.div 
                className="absolute top-0 left-0 h-full bg-amber-500/30 pointer-events-none z-0 backdrop-blur-sm"
                animate={{ width: zone === 'DOWN' ? '100%' : '0%' }}
                transition={{ duration: zone === 'DOWN' ? getDwellTime('DOWN', sensitivity) / 1000 : 0, ease: "linear" }}
              />
              <div className={`relative z-10 flex items-center gap-2 sm:gap-4 px-4 py-2 sm:px-8 sm:py-3 rounded-full border-2 transition-colors ${zone === 'DOWN' ? 'bg-zinc-800 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-zinc-900 border-zinc-700'}`}>
                <div className="flex items-center gap-1 text-zinc-400">
                  <ArrowDown className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="text-zinc-500 font-bold tracking-[0.2em] text-xs sm:text-sm">LOOK DOWN TO</span>
                <span className="text-white font-black tracking-widest text-base sm:text-lg whitespace-pre-line text-center">
                  {labels.DOWN}
                </span>
              </div>
            </div>
          )}
          </motion.div>
        ) : (
          <motion.div 
            key="main-menu"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3 }}
            className="flex-1 grid grid-cols-3 grid-rows-3 gap-1.5 min-[380px]:gap-2 sm:gap-4 p-2 min-[380px]:p-4 sm:p-8 bg-[#0a0a0a]"
          >
            <div className="col-start-2 row-start-1">
              <ZoneBox id="UP" label={labels.UP || ""} className="w-full h-full rounded-xl sm:rounded-[2rem]" />
            </div>
            
            <div className="col-start-1 row-start-2">
              <ZoneBox id="LEFT" label={labels.LEFT || ""} className="w-full h-full rounded-xl sm:rounded-[2rem]" />
            </div>
            
            <div className="col-start-2 row-start-2">
              <ZoneBox id="CENTER" label={labels.CENTER || ""} className="w-full h-full rounded-xl sm:rounded-[2rem] border-2 sm:border-4 border-zinc-800 bg-zinc-900/50 shadow-inner" />
            </div>
            
            <div className="col-start-3 row-start-2">
              <ZoneBox id="RIGHT" label={labels.RIGHT || ""} className="w-full h-full rounded-xl sm:rounded-[2rem]" />
            </div>
            
            <div className="col-start-2 row-start-3">
              <ZoneBox id="DOWN" label={labels.DOWN || ""} className="w-full h-full rounded-xl sm:rounded-[2rem]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Webcam for processing */}
      {cameraStarted && !mouseFallback && (
        <Webcam
          ref={webcamRef}
          className="absolute opacity-0 w-[1px] h-[1px] pointer-events-none z-[-1]"
          audio={false}
          disablePictureInPicture={false}
          forceScreenshotSourceSize={false}
          imageSmoothing={true}
          mirrored={false}
          onUserMedia={handleUserMedia}
          onUserMediaError={(err: string | DOMException) => {
            console.error("Camera error:", err);
            setCameraError(typeof err === 'string' ? err : err.message || "Permission denied");
          }}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.92}
        />
      )}

      {isEditingPhrases && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-400" />
              Edit Quick Phrases
            </h2>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
              {tempPhrases.map((phrase, idx) => (
                <div key={idx}>
                  <label className="block text-xs font-bold text-zinc-400 mb-1">Phrase {idx + 1}</label>
                  <input
                    type="text"
                    value={phrase}
                    onChange={e => {
                      const newPhrases = [...tempPhrases];
                      newPhrases[idx] = e.target.value;
                      setTempPhrases(newPhrases);
                    }}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                    maxLength={40}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsEditingPhrases(false)}
                className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setCustomPhrases(tempPhrases);
                  localStorage.setItem('customPhrases', JSON.stringify(tempPhrases));
                  setIsEditingPhrases(false);
                }}
                className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition-colors"
              >
                Save Phrases
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditingPhone && (
        <div className="hidden"></div>
      )}

      {/* Selected Phrase Full Screen Overlay */}
      <AnimatePresence>
        {selectedPhrase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-[#1e8e3e] flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="flex gap-2 mb-8">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-3 h-3 rounded-full bg-black/40" />
              ))}
            </div>
            <h1 className="text-5xl sm:text-7xl font-bold text-white tracking-tight leading-tight max-w-4xl">
              {selectedPhrase}
            </h1>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

