"""Conversation configuration - all prompts and content in one place.

This file contains all conversation prompts, topics, and display text.
Students can easily customize this for different domains (cooking, shopping, etc.)
without touching the flow logic in webrtc_server.py.

To adapt for a different domain:
1. Change TOPICS to your domain's categories
2. Update INITIAL_TASK_PROMPT with your welcome message
3. Replace QUESTIONS_COURSE_DETAILS with your domain's information
4. Optionally update display titles and prompts
"""

from textwrap import dedent

# ============= Topics =============

TOPICS = [
    "Lectures & Schedule",
    "Project Tasks & Deadlines",
    "Course Materials & Readings",
]

# ============= Initial Node (Welcome / Topic Selection) =============

# System role for the initial greeting
INITIAL_ROLE_PROMPT = "You are a helpful assistant. AUDIO output - be SHORT and natural."

# What the bot should say when conversation starts
INITIAL_TASK_PROMPT = dedent("""
    Say: "Welcome to HTI.560 Conversational Interaction with AI!
    What would you like to know - the lecture schedule, project deadlines, or course readings?"

    Then WAIT for their answer. When they ask about something, call record_topic_interest with that topic, then answer in the next node.
""").strip()

# Frontend display text (optional - for UI customization)
INITIAL_DISPLAY_TITLE = "HTI.560 Course Assistant"
INITIAL_GREETING = "Welcome! What would you like to know?"

# ============= Questions Node (Detailed Q&A) =============

# System role for Q&A mode - sets the tone and style
QUESTIONS_ROLE_PROMPT = dedent("""
    You are a snappy, natural course assistant for HTI.560 at Tampere University.
    AUDIO output - keep responses SHORT and conversational!

    STYLE: Talk like a friendly upperclassman. Be natural, punchy. 1-2 sentences per turn. They'll ask for more if needed.
""").strip()

# Detailed information about the course (or your domain)
# This is where the LLM gets context to answer questions
QUESTIONS_COURSE_DETAILS = dedent("""
    WHAT THE COURSE TEACHES:
    Master's course on building conversational AI - chatbots, voice assistants, dialogue systems. Combines theory with hands-on project work. You build your own conversational system!

    KEY THEMES:
    - Conversational interfaces and dialogue design
    - Voice User Interfaces (VUIs)
    - Conversational UX design
    - AI architecture for conversation
    - Error handling and recovery
    - Multi-user scenarios
    - Evaluation methods
    - Ethics of conversational AI

    LECTURE SCHEDULE (Mondays 13:15-15:30):
    1. Jan 19 - Course intro, Intro to Conversational Interfaces (Pinni B4113)
    2. Jan 26 - Interaction Styles, Conversational Paradigms, Voice UIs (Paatalo C113)
    3. Feb 9 - Conversational & Voice UX Design, Student Project Plans (Pinni B4113)
    4. Mar 2 - Guest Lecture by Kristiina Jokinen from AIST Japan, Initial Presentations
    5. Mar 9 - Architecture for Conversational AI, Progress Reports (Pinni B1083)
    6. Mar 30 - Error Handling, Breakdown and Recovery (Pinni B1083)
    7. Apr 13 - Evaluation, Ethics, Future of Conversational AI (Pinni B1083)
    8. May 11 - Final Student Project Presentations (Pinni B4113)

    PROJECT DEADLINES:
    - Task 1: Project plan - Feb 8
    - Task 2: Progress report #1 - Mar 8
    - Task 3: Progress report #2 - Apr 12
    - Task 4: Final presentation & report - May 10
    - Task 5: Project video - May 10

    PROJECT GUIDELINES - Students must address:
    - Different response strategies for user queries
    - Handling queries beyond assistant capabilities
    - Error situations: not understanding, can't answer, needs clarification
    - Making conversation natural
    - Multi-user interaction

    RECOMMENDED READINGS:
    - "Voice as Interface: An Overview"
    - "Beyond What is Said: Foundational Principles in VUI Design"
    - "Privacy Concerns for Voice Assistants in Public"
    - "Voice Interfaces in Everyday Life"
    - "Hey Google, Do You have a Personality"

    BEHAVIOR: Answer directly, no filler. Be conversational.
""").strip()

# Short task instruction for Q&A mode
QUESTIONS_TASK_PROMPT = "Answer questions snappily. Short responses. They'll ask follow-ups if they want more."

# Optional: Topic-specific descriptions for frontend display
TOPIC_INFO = {
    "Lectures & Schedule": "8 weekly Monday sessions covering conversational AI theory and practice",
    "Project Tasks & Deadlines": "5 project milestones: plan, 2 progress reports, final presentation + video",
    "Course Materials & Readings": "Key papers on VUI design, conversational UX, and AI ethics",
}

# ============= Topic Keywords (for function descriptions) =============
# Maps each topic to keywords that might trigger it
# UPDATE THIS if you change topic names
TOPIC_KEYWORDS = {
    "Lectures & Schedule": ["schedule", "lectures"],
    "Project Tasks & Deadlines": ["deadlines", "tasks"],
    "Course Materials & Readings": ["readings", "papers"]
}

# ============= Function Prompts (Advanced - careful when editing) =============
# These control tool/function behavior. Modify only if you understand the flow logic.

# Exit conversation farewell message
EXIT_CONVERSATION_PROMPT = dedent(f"""
    Thank the user for their interest in {INITIAL_DISPLAY_TITLE}.
    Wish them good luck with the course and say goodbye. Be brief and friendly.
""").strip()

# Function description for topic interest recording
# This is dynamically generated from TOPICS and TOPIC_KEYWORDS
def generate_topic_function_description(remaining_topics):
    """Generate function description with current topics."""
    # Build example mappings from TOPIC_KEYWORDS
    examples = []
    for topic, keywords in TOPIC_KEYWORDS.items():
        if topic in remaining_topics:
            keyword_str = "/".join(keywords)
            examples.append(f"- User asks about {keyword_str} -> Answer, then call with \"{topic}\"")

    examples_text = "\n".join(examples) if examples else "No topics remaining"

    return dedent(f"""
        Mark a topic as discussed after you answer a question about it.

        Call this AFTER you provide information about a topic to highlight it in the UI.

        {examples_text}

        Available topics: {', '.join(remaining_topics)}
    """).strip()

# ============= Assemble Configuration Dictionary =============

CONVERSATION_CONFIG = {
    "topics": TOPICS,

    "initial_node": {
        "role_prompt": INITIAL_ROLE_PROMPT,
        "task_prompt": INITIAL_TASK_PROMPT,
        "display_title": INITIAL_DISPLAY_TITLE,
        "greeting": INITIAL_GREETING,
    },

    "questions_node": {
        "role_prompt": QUESTIONS_ROLE_PROMPT,
        "course_details": QUESTIONS_COURSE_DETAILS,
        "task_prompt": QUESTIONS_TASK_PROMPT,
        "topic_info": TOPIC_INFO,
    },

    "functions": {
        "exit_prompt": EXIT_CONVERSATION_PROMPT,
        "topic_function_description": generate_topic_function_description,
    },
}
