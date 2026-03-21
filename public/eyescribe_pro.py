import cv2
import mediapipe as mp
import numpy as np
import pyttsx3
import time
import math

# Initialize TTS
engine = pyttsx3.init()
engine.setProperty('rate', 150)

def speak(text):
    if text.strip():
        engine.say(text)
        engine.runAndWait()

# MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Constants
SOS_TIME = 3.0
EAR_THRESHOLD = 0.2

# Dictionary
PREDICTIONS = {
    "": ["I", "THE", "HELLO"],
    "I": ["WANT", "NEED", "AM"],
    "I WANT": ["WATER", "FOOD", "SLEEP"],
    "I NEED": ["WATER", "HELP", "REST"],
    "I AM": ["HUNGRY", "THIRSTY", "IN PAIN"],
    "THE": ["NURSE", "DOCTOR", "BED"],
    "CALL": ["DOCTOR", "NURSE", "FAMILY"],
}

KEYBOARD_CHUNKS = [
    ['E', 'T', 'A', 'O'],
    ['I', 'N', 'S', 'R'],
    ['H', 'D', 'L', 'U'],
    ['C', 'M', 'F', 'Y'],
    ['W', 'G', 'P', 'B'],
    ['V', 'K', 'X', 'Q'],
    ['J', 'Z', ' ', '.'],
]

# State variables
current_state = 'MAIN_MENU'
typed_text = ""
current_chunk_idx = 0
selected_chunk = []

gaze_zone = 'CENTER'
zone_start_time = time.time()
last_zone = 'CENTER'

eyes_closed_start = None
sos_active = False
cooldown_until = 0

def get_prediction(text):
    words = text.strip().split()
    if not words:
        return PREDICTIONS[""][0]
    last_word = words[-1].upper()
    last_two = " ".join(words[-2:]).upper() if len(words) >= 2 else ""
    
    if last_two in PREDICTIONS:
        return PREDICTIONS[last_two][0]
    if last_word in PREDICTIONS:
        return PREDICTIONS[last_word][0]
    return "HELLO"

def dist(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def calculate_ear(landmarks, frame_w, frame_h):
    # Left eye: 33, 133, 159, 145
    # Right eye: 362, 263, 386, 374
    def get_pt(idx):
        return (int(landmarks[idx].x * frame_w), int(landmarks[idx].y * frame_h))
    
    l_h = dist(get_pt(33), get_pt(133))
    l_v = dist(get_pt(159), get_pt(145))
    ear_l = l_v / l_h if l_h > 0 else 0
    
    r_h = dist(get_pt(362), get_pt(263))
    r_v = dist(get_pt(386), get_pt(374))
    ear_r = r_v / r_h if r_h > 0 else 0
    
    return (ear_l + ear_r) / 2.0

smoothed_h_dev = 0.0
smoothed_v_dev = 0.0

def get_gaze_deviation(landmarks, frame_w, frame_h):
    global smoothed_h_dev, smoothed_v_dev
    def get_pt(idx):
        return (landmarks[idx].x * frame_w, landmarks[idx].y * frame_h)
    
    # Left eye
    lc = get_pt(33)
    rc = get_pt(133)
    tc = get_pt(159)
    bc = get_pt(145)
    iris = get_pt(468)
    
    h_dist = dist(lc, rc)
    
    if h_dist == 0:
        return 0.0, 0.0
        
    eye_center_x = (lc[0] + rc[0]) / 2.0
    eye_center_y = (lc[1] + rc[1]) / 2.0
    
    raw_h_dev = (iris[0] - eye_center_x) / h_dist
    raw_v_dev = (iris[1] - eye_center_y) / h_dist + 0.025
    
    smoothed_h_dev = smoothed_h_dev * 0.7 + raw_h_dev * 0.3
    smoothed_v_dev = smoothed_v_dev * 0.7 + raw_v_dev * 0.3
    
    return smoothed_h_dev, smoothed_v_dev

def determine_zone(h_dev, v_dev):
    H_THRESH = 0.06
    V_THRESH = 0.035
    
    if abs(h_dev) > abs(v_dev) * 1.5:
        if abs(h_dev) > H_THRESH:
            return 'LEFT' if h_dev > 0 else 'RIGHT'
    else:
        if abs(v_dev) > V_THRESH:
            return 'DOWN' if v_dev > 0 else 'UP'
            
    return 'CENTER'

def draw_ui(frame, state, zone, text, sos):
    h, w, _ = frame.shape
    
    if sos:
        frame[:] = (0, 0, 255)
        cv2.putText(frame, "SOS EMERGENCY TRIGGERED", (w//2 - 300, h//2), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 4)
        return frame

    # Dark medical theme
    frame[:] = (40, 40, 40)
    
    # Text Box
    cv2.rectangle(frame, (0, 0), (w, 100), (20, 20, 20), -1)
    cv2.putText(frame, text, (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 3)
    
    # Define boxes
    cw, ch = w // 3, (h - 100) // 3
    boxes = {
        'CENTER': (cw, 100 + ch, cw*2, 100 + ch*2),
        'UP': (cw, 100, cw*2, 100 + ch),
        'DOWN': (cw, 100 + ch*2, cw*2, h),
        'LEFT': (0, 100 + ch, cw, 100 + ch*2),
        'RIGHT': (cw*2, 100 + ch, w, 100 + ch*2)
    }
    
    labels = {}
    if state == 'MAIN_MENU':
        labels = {
            'UP': f"PREDICT: {get_prediction(text)}",
            'LEFT': "QUICK PHRASES",
            'RIGHT': "KEYBOARD",
            'DOWN': "BACKSPACE",
            'CENTER': "SPEAK & CLEAR"
        }
    elif state == 'QUICK_PHRASES':
        labels = {
            'UP': "I NEED WATER",
            'DOWN': "I AM IN PAIN",
            'LEFT': "CALL DOCTOR",
            'RIGHT': "ADJUST BED",
            'CENTER': "BACK"
        }
    elif state == 'KEYBOARD_LVL1':
        c1 = KEYBOARD_CHUNKS[current_chunk_idx]
        c2 = KEYBOARD_CHUNKS[(current_chunk_idx + 1) % len(KEYBOARD_CHUNKS)]
        c3 = KEYBOARD_CHUNKS[(current_chunk_idx + 2) % len(KEYBOARD_CHUNKS)]
        labels = {
            'UP': str(c1),
            'RIGHT': str(c2),
            'DOWN': str(c3),
            'LEFT': "NEXT PAGE",
            'CENTER': "BACK"
        }
    elif state == 'KEYBOARD_LVL2':
        labels = {
            'UP': selected_chunk[0] if len(selected_chunk) > 0 else "",
            'RIGHT': selected_chunk[1] if len(selected_chunk) > 1 else "",
            'DOWN': selected_chunk[2] if len(selected_chunk) > 2 else "",
            'LEFT': selected_chunk[3] if len(selected_chunk) > 3 else "",
            'CENTER': "BACK"
        }

    for key, (x1, y1, x2, y2) in boxes.items():
        color = (0, 200, 0) if key == zone else (60, 60, 60)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, -1)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (100, 100, 100), 2)
        
        # Draw label
        lbl = labels.get(key, "")
        text_size = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 1, 2)[0]
        tx = x1 + (x2 - x1 - text_size[0]) // 2
        ty = y1 + (y2 - y1 + text_size[1]) // 2
        cv2.putText(frame, lbl, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            
    return frame

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
        
    frame = cv2.flip(frame, 1)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)
    
    h, w, _ = frame.shape
    
    if results.multi_face_landmarks:
        landmarks = results.multi_face_landmarks[0].landmark
        
        # EAR for SOS
        ear = calculate_ear(landmarks, w, h)
        if ear < EAR_THRESHOLD:
            if eyes_closed_start is None:
                eyes_closed_start = time.time()
            elif time.time() - eyes_closed_start >= SOS_TIME:
                if not sos_active:
                    sos_active = True
                    speak("SOS EMERGENCY TRIGGERED")
        else:
            if eyes_closed_start is not None:
                closed_duration = time.time() - eyes_closed_start
                # Detect a blink (between 0.1s and 0.8s)
                if 0.1 < closed_duration < 0.8:
                    if time.time() >= cooldown_until:
                        # Trigger action for the current highlighted zone
                        z = last_zone
                        if current_state == 'MAIN_MENU':
                            if z == 'UP':
                                typed_text += (get_prediction(typed_text) + " ")
                            elif z == 'LEFT':
                                current_state = 'QUICK_PHRASES'
                            elif z == 'RIGHT':
                                current_state = 'KEYBOARD_LVL1'
                            elif z == 'DOWN':
                                typed_text = typed_text[:-1]
                            elif z == 'CENTER':
                                speak(typed_text)
                                typed_text = ""
                        
                        elif current_state == 'QUICK_PHRASES':
                            if z == 'UP':
                                speak("I NEED WATER")
                            elif z == 'DOWN':
                                speak("I AM IN PAIN")
                            elif z == 'LEFT':
                                speak("CALL DOCTOR")
                            elif z == 'RIGHT':
                                speak("ADJUST BED")
                            elif z == 'CENTER':
                                current_state = 'MAIN_MENU'
                                
                        elif current_state == 'KEYBOARD_LVL1':
                            if z == 'UP':
                                selected_chunk = KEYBOARD_CHUNKS[current_chunk_idx]
                                current_state = 'KEYBOARD_LVL2'
                            elif z == 'RIGHT':
                                selected_chunk = KEYBOARD_CHUNKS[(current_chunk_idx + 1) % len(KEYBOARD_CHUNKS)]
                                current_state = 'KEYBOARD_LVL2'
                            elif z == 'DOWN':
                                selected_chunk = KEYBOARD_CHUNKS[(current_chunk_idx + 2) % len(KEYBOARD_CHUNKS)]
                                current_state = 'KEYBOARD_LVL2'
                            elif z == 'LEFT':
                                current_chunk_idx = (current_chunk_idx + 3) % len(KEYBOARD_CHUNKS)
                            elif z == 'CENTER':
                                current_state = 'MAIN_MENU'
                                
                        elif current_state == 'KEYBOARD_LVL2':
                            if z == 'UP' and len(selected_chunk) > 0:
                                typed_text += selected_chunk[0]
                                current_state = 'MAIN_MENU'
                            elif z == 'RIGHT' and len(selected_chunk) > 1:
                                typed_text += selected_chunk[1]
                                current_state = 'MAIN_MENU'
                            elif z == 'DOWN' and len(selected_chunk) > 2:
                                typed_text += selected_chunk[2]
                                current_state = 'MAIN_MENU'
                            elif z == 'LEFT' and len(selected_chunk) > 3:
                                typed_text += selected_chunk[3]
                                current_state = 'MAIN_MENU'
                            elif z == 'CENTER':
                                current_state = 'KEYBOARD_LVL1'
                        
                        last_zone = 'CENTER'
                        cooldown_until = time.time() + 0.5
                        
            eyes_closed_start = None
            sos_active = False
            
        # Gaze
        if not sos_active:
            h_dev, v_dev = get_gaze_deviation(landmarks, w, h)
            current_gaze = determine_zone(h_dev, v_dev)
            
            if time.time() >= cooldown_until:
                if current_gaze != last_zone:
                    last_zone = current_gaze
                
        else:
            current_gaze = 'CENTER'
        eyes_closed_start = None

    # Draw
    frame = draw_ui(frame, current_state, last_zone, typed_text, sos_active)
    
    cv2.imshow('EyeScribe Pro', frame)
    if cv2.waitKey(1) & 0xFF == 27: # ESC
        break

cap.release()
cv2.destroyAllWindows()
