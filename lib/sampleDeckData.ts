/** Hand-written sample decks so judges can try the review loop instantly, no AI wait. */

export type SampleDeckKey = "bio" | "cs";

export interface SampleConcept {
  conceptTitle: string;
  coreFact: string;
  expectedKeyPoints: string[];
  initialQuestion: string;
  applicationQuestion: string;
  synthesisQuestion: string;
}

export interface SampleDeck {
  title: string;
  concepts: SampleConcept[];
}

export const SAMPLE_DECKS: Record<SampleDeckKey, SampleDeck> = {
  bio: {
    title: "AP Biology · Energy, Genes & Evolution",
    concepts: [
      {
        conceptTitle: "Cellular Respiration",
        coreFact:
          "Cellular respiration breaks glucose down to carbon dioxide and water, capturing the released energy as ATP through glycolysis, the Krebs cycle, and oxidative phosphorylation.",
        expectedKeyPoints: [
          "glucose is broken down to carbon dioxide and water",
          "the released energy is captured as ATP",
          "stages: glycolysis, Krebs cycle, oxidative phosphorylation",
          "oxygen is the final electron acceptor",
        ],
        initialQuestion: "What is cellular respiration, and what are its three main stages?",
        applicationQuestion:
          "A poison stops oxygen from reaching a cell's mitochondria. Which stage of respiration halts first, and what happens to ATP output?",
        synthesisQuestion:
          "How is cellular respiration the chemical reverse of photosynthesis, and why does that make the two processes interdependent in an ecosystem?",
      },
      {
        conceptTitle: "Glycolysis",
        coreFact:
          "Glycolysis splits one glucose molecule into two pyruvate in the cytoplasm, netting 2 ATP and 2 NADH without needing oxygen.",
        expectedKeyPoints: [
          "occurs in the cytoplasm",
          "glucose is split into two pyruvate",
          "net gain of 2 ATP and 2 NADH",
          "does not require oxygen",
        ],
        initialQuestion: "Where does glycolysis happen, and what does it produce from one glucose molecule?",
        applicationQuestion:
          "Sprinting muscle cells run short of oxygen yet still make some ATP. Which pathway keeps running, and why must the cells regenerate NAD+?",
        synthesisQuestion:
          "Why is glycolysis considered evolutionarily ancient, and how does that connect to it needing neither oxygen nor organelles?",
      },
      {
        conceptTitle: "Electron Transport Chain",
        coreFact:
          "The electron transport chain on the inner mitochondrial membrane uses electrons from NADH and FADH2 to pump protons; ATP synthase lets them flow back to make most of the cell's ATP.",
        expectedKeyPoints: [
          "located on the inner mitochondrial membrane",
          "electrons from NADH and FADH2 power proton pumping",
          "the proton gradient drives ATP synthase",
          "oxygen is the final electron acceptor, forming water",
        ],
        initialQuestion: "How does the electron transport chain produce most of the cell's ATP?",
        applicationQuestion:
          "A drug makes the inner mitochondrial membrane leaky to protons. What happens to ATP production, and where does the energy go instead?",
        synthesisQuestion:
          "Compare chemiosmosis in mitochondria with chemiosmosis in chloroplasts: what is the same, and what supplies the energy in each?",
      },
      {
        conceptTitle: "Light Reactions",
        coreFact:
          "In the thylakoid membranes, light energy splits water, releasing oxygen, and drives production of ATP and NADPH that power the Calvin cycle.",
        expectedKeyPoints: [
          "occur in the thylakoid membranes",
          "light splits water and releases oxygen",
          "produce ATP and NADPH",
          "their products power the Calvin cycle",
        ],
        initialQuestion: "What happens during the light reactions of photosynthesis, and what do they produce?",
        applicationQuestion:
          "An herbicide blocks photosystem II in a plant kept in bright light. Will the plant still release oxygen? Explain.",
        synthesisQuestion:
          "How do the light reactions and the Calvin cycle depend on each other, and what happens to the Calvin cycle in prolonged darkness?",
      },
      {
        conceptTitle: "Calvin Cycle",
        coreFact:
          "In the stroma, the Calvin cycle uses ATP and NADPH to fix carbon dioxide with the enzyme rubisco, producing the three-carbon sugar G3P.",
        expectedKeyPoints: [
          "occurs in the stroma",
          "rubisco fixes carbon dioxide",
          "uses ATP and NADPH from the light reactions",
          "produces the sugar G3P",
        ],
        initialQuestion: "Where does the Calvin cycle occur, and what does it build from carbon dioxide?",
        applicationQuestion:
          "On a hot, dry day a plant closes its stomata. How does that affect the Calvin cycle, and why?",
        synthesisQuestion:
          "Why are C4 and CAM plants better adapted to hot climates, and which Calvin cycle weakness do they work around?",
      },
      {
        conceptTitle: "Enzyme Kinetics",
        coreFact:
          "Enzymes lower activation energy by binding substrates at an active site; their rate depends on temperature, pH, and substrate concentration until the enzymes are saturated.",
        expectedKeyPoints: [
          "enzymes lower activation energy",
          "the substrate binds the active site",
          "activity depends on temperature and pH",
          "the rate plateaus when enzymes are saturated",
        ],
        initialQuestion: "How do enzymes speed up reactions, and what factors affect their rate?",
        applicationQuestion:
          "A patient's fever reaches 42°C. Why might some of their enzymes stop working, and is the damage always reversible?",
        synthesisQuestion:
          "Compare competitive and noncompetitive inhibition: how does adding more substrate affect each, and why?",
      },
      {
        conceptTitle: "Mitosis vs Meiosis",
        coreFact:
          "Mitosis makes two genetically identical diploid cells for growth and repair; meiosis makes four genetically unique haploid gametes through two divisions with crossing over.",
        expectedKeyPoints: [
          "mitosis gives two identical diploid cells",
          "meiosis gives four haploid gametes",
          "meiosis has two rounds of division",
          "crossing over and independent assortment create variation",
        ],
        initialQuestion: "How do the products of mitosis and meiosis differ?",
        applicationQuestion:
          "A human cell with 46 chromosomes goes through meiosis. How many chromosomes does each resulting cell have, and why does that matter at fertilization?",
        synthesisQuestion:
          "How does nondisjunction in meiosis lead to conditions like Down syndrome, and why can't the same error in a skin cell's mitosis be inherited?",
      },
      {
        conceptTitle: "DNA Replication",
        coreFact:
          "DNA replication is semiconservative: helicase unwinds the helix and DNA polymerase builds new strands 5' to 3', continuously on the leading strand and in Okazaki fragments on the lagging strand.",
        expectedKeyPoints: [
          "semiconservative: each new helix keeps one old strand",
          "helicase unwinds the DNA",
          "DNA polymerase builds strands 5' to 3'",
          "the lagging strand is made in Okazaki fragments",
        ],
        initialQuestion: "How is DNA copied before a cell divides?",
        applicationQuestion:
          "If DNA ligase stopped working, which strand would be affected most, and what would the new DNA look like?",
        synthesisQuestion:
          "How does DNA polymerase's 5'-to-3' rule explain both Okazaki fragments and the gradual shortening of telomeres?",
      },
      {
        conceptTitle: "Gene Expression",
        coreFact:
          "Transcription copies a gene's DNA into mRNA in the nucleus; at the ribosome, translation reads mRNA codons while tRNAs deliver the matching amino acids to build a protein.",
        expectedKeyPoints: [
          "transcription makes mRNA from DNA",
          "transcription happens in the nucleus",
          "ribosomes read mRNA codons during translation",
          "tRNA anticodons deliver amino acids",
        ],
        initialQuestion: "What are transcription and translation, and where does each happen?",
        applicationQuestion:
          "A point mutation changes one DNA base in a gene. Describe two different effects it could have on the resulting protein.",
        synthesisQuestion:
          "How can eukaryotic cells make several proteins from one gene, and which step of gene expression makes that possible?",
      },
      {
        conceptTitle: "Natural Selection",
        coreFact:
          "Natural selection happens when heritable variation affects survival and reproduction, so advantageous traits become more common in a population over generations.",
        expectedKeyPoints: [
          "requires heritable variation",
          "variation affects survival and reproduction",
          "favorable traits increase in frequency over generations",
          "populations evolve, not individuals",
        ],
        initialQuestion: "What conditions are needed for natural selection to occur?",
        applicationQuestion:
          "Antibiotics are overused on a farm. Explain step by step how resistant bacteria come to dominate.",
        synthesisQuestion:
          "How does Hardy-Weinberg equilibrium act as a null model for detecting natural selection in a population?",
      },
    ],
  },
  cs: {
    title: "CS Fundamentals · Algorithms & Systems",
    concepts: [
      {
        conceptTitle: "Big-O Notation",
        coreFact:
          "Big-O notation describes how an algorithm's running time or memory grows as input size grows, usually as a worst-case upper bound that ignores constants and lower-order terms.",
        expectedKeyPoints: [
          "describes growth as input size increases",
          "usually a worst-case upper bound",
          "drops constants and lower-order terms",
          "common classes: O(1), O(log n), O(n), O(n^2)",
        ],
        initialQuestion: "What does Big-O notation describe, and what does it ignore?",
        applicationQuestion:
          "A function loops over an array and, for each element, binary-searches another sorted array of the same size. What is its Big-O, and why?",
        synthesisQuestion:
          "Why can an O(n log n) algorithm beat an O(n) one on real inputs, and what does that reveal about the limits of Big-O?",
      },
      {
        conceptTitle: "Hash Tables",
        coreFact:
          "Hash tables map keys to buckets with a hash function, giving average O(1) lookup, insert, and delete; collisions are handled by chaining or open addressing, and resizing keeps the load factor low.",
        expectedKeyPoints: [
          "a hash function maps keys to buckets",
          "average O(1) operations",
          "collisions handled by chaining or open addressing",
          "resizing keeps the load factor low",
        ],
        initialQuestion: "How does a hash table achieve fast lookups, and how does it handle collisions?",
        applicationQuestion:
          "Your hash table's lookups suddenly degrade toward O(n). What two causes would you investigate first?",
        synthesisQuestion:
          "Compare a hash table with a balanced binary search tree: when would you pick the tree despite slower average lookups?",
      },
      {
        conceptTitle: "Binary Search",
        coreFact:
          "Binary search finds a target in a sorted array by comparing it with the middle element and halving the search interval each step, running in O(log n) time.",
        expectedKeyPoints: [
          "requires sorted data",
          "compares the target with the middle element",
          "halves the search space each step",
          "runs in O(log n) time",
        ],
        initialQuestion: "How does binary search work, and what does it require of the data?",
        applicationQuestion:
          "At most how many comparisons does binary search need on a sorted array of one million items? Show your reasoning.",
        synthesisQuestion:
          "How is binary search on an array related to searching a balanced binary search tree, and why do both run in O(log n)?",
      },
      {
        conceptTitle: "Recursion & Call Stack",
        coreFact:
          "A recursive function solves a problem by calling itself on smaller inputs until it reaches a base case; every call pushes a new frame onto the call stack.",
        expectedKeyPoints: [
          "the function calls itself on a smaller subproblem",
          "a base case stops the recursion",
          "each call pushes a stack frame",
          "a missing base case causes a stack overflow",
        ],
        initialQuestion: "What makes a function recursive, and what role does the call stack play?",
        applicationQuestion:
          "A recursive factorial(100000) crashes with a stack overflow. Why, and how would you rewrite it to avoid the crash?",
        synthesisQuestion:
          "How does recursion power divide-and-conquer algorithms like merge sort, and where does the real work happen in each call?",
      },
      {
        conceptTitle: "TCP vs UDP",
        coreFact:
          "TCP is connection-oriented and guarantees reliable, ordered delivery with retransmission and congestion control; UDP is connectionless, with lower overhead but no delivery guarantees.",
        expectedKeyPoints: [
          "TCP sets up a connection with a handshake",
          "TCP guarantees reliable, ordered delivery",
          "UDP is connectionless with no delivery guarantee",
          "UDP has lower overhead and latency",
        ],
        initialQuestion: "What are the key differences between TCP and UDP?",
        applicationQuestion:
          "You're sending player positions in a live multiplayer game. Would you choose TCP or UDP, and how would you handle lost packets?",
        synthesisQuestion:
          "Why does HTTP/3 run over QUIC on top of UDP instead of TCP, and which TCP problem does that avoid?",
      },
      {
        conceptTitle: "CAP Theorem",
        coreFact:
          "The CAP theorem says that when a network partition occurs, a distributed system must choose between consistency and availability; partition tolerance itself is not optional.",
        expectedKeyPoints: [
          "consistency, availability, partition tolerance",
          "network partitions are unavoidable",
          "during a partition choose consistency or availability",
          "systems are described as CP or AP",
        ],
        initialQuestion: "What does the CAP theorem state about distributed systems?",
        applicationQuestion:
          "A bank ledger and a social-media like counter are both distributed. Which side of CAP should each favor during a partition, and why?",
        synthesisQuestion:
          "How does eventual consistency let AP systems recover after a partition, and what kinds of conflicts must they resolve?",
      },
      {
        conceptTitle: "Deadlock",
        coreFact:
          "A deadlock occurs when processes wait on each other's resources in a cycle; it requires mutual exclusion, hold-and-wait, no preemption, and circular wait, so breaking any one prevents it.",
        expectedKeyPoints: [
          "processes wait on each other in a cycle",
          "mutual exclusion",
          "hold and wait with no preemption",
          "circular wait; breaking any condition prevents deadlock",
        ],
        initialQuestion: "What is a deadlock, and which four conditions cause it?",
        applicationQuestion:
          "One thread locks account A then B while another locks B then A during transfers. How would you change the code to prevent deadlock?",
        synthesisQuestion:
          "How do deadlock, livelock, and starvation differ, and can a system suffer one without the others?",
      },
      {
        conceptTitle: "Dijkstra's Algorithm",
        coreFact:
          "Dijkstra's algorithm finds shortest paths from one source in a graph with non-negative edge weights by repeatedly settling the closest unvisited node, typically with a priority queue.",
        expectedKeyPoints: [
          "finds shortest paths from a single source",
          "requires non-negative edge weights",
          "greedily settles the closest unvisited node",
          "uses a priority queue",
        ],
        initialQuestion: "What problem does Dijkstra's algorithm solve, and how does it choose the next node?",
        applicationQuestion:
          "Your routing graph gains one negative-weight edge (a toll refund). Why might Dijkstra now give a wrong answer, and what would you use instead?",
        synthesisQuestion:
          "In what sense is Dijkstra's algorithm greedy, and how does it relate to breadth-first search on an unweighted graph?",
      },
      {
        conceptTitle: "Dynamic Programming",
        coreFact:
          "Dynamic programming solves problems with overlapping subproblems and optimal substructure by storing subproblem results, either top-down with memoization or bottom-up with tabulation.",
        expectedKeyPoints: [
          "overlapping subproblems",
          "optimal substructure",
          "stores results to avoid recomputation",
          "memoization (top-down) or tabulation (bottom-up)",
        ],
        initialQuestion: "When does dynamic programming apply, and how does it avoid repeated work?",
        applicationQuestion:
          "Naive recursive Fibonacci(50) takes forever. Explain why, and how dynamic programming brings it down to O(n).",
        synthesisQuestion:
          "How do you decide whether a problem calls for dynamic programming, a greedy algorithm, or divide and conquer?",
      },
      {
        conceptTitle: "Garbage Collection",
        coreFact:
          "Garbage collectors automatically reclaim memory that can no longer be reached from program roots, commonly with mark-and-sweep or generational collection.",
        expectedKeyPoints: [
          "reclaims memory that is unreachable",
          "reachability is traced from roots",
          "mark-and-sweep marks live objects, then frees the rest",
          "generational GC exploits short-lived objects",
        ],
        initialQuestion: "How does a garbage collector decide which memory to free?",
        applicationQuestion:
          "A long-running server's memory keeps growing even though the language has a garbage collector. What kind of bug would you suspect?",
        synthesisQuestion:
          "Compare tracing garbage collection with reference counting: which one handles cycles, and what does each cost at runtime?",
      },
    ],
  },
};
