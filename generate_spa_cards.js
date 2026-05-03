const fs = require('fs');
const path = require('path');

const cards = [
  {
    front: "What are the main types of spondyloarthropathies (SpA)?",
    back: "The main types include: (1) Ankylosing spondylitis, (2) Psoriatic arthritis, (3) Reactive arthritis (formerly called Reiter's syndrome), (4) Enteropathic arthritis, and (5) Juvenile ankylosing spondylitis.",
    tags: ["SpA", "classification", "types"]
  },
  {
    front: "What are the diagnostic criteria for identifying spondyloarthropathies?",
    back: "Key criteria include: (1) Inflammatory spinal pain, (2) Presence of sacroiliitis, (3) Positive family history of SpA, (4) Personal or family history of psoriasis, (5) History of inflammatory bowel disease, (6) Uveitis, sub-conjunctivitis, diarrhea, or buttock pain, (7) Asymmetrical lower limb involvement with large joint involvement.",
    tags: ["SpA", "diagnosis", "clinical-criteria"]
  },
  {
    front: "What are the characteristic radiographic findings in spondyloarthropathies?",
    back: "Characteristic findings include: (1) Sacroiliitis with erosions, sclerosis, and fusion of sacroiliac joints, (2) Spondylitis (inflammation of axial spine), (3) Syndesmophytes (bony bridges between vertebrae), (4) Bamboo spine (complete vertebral fusion in advanced disease).",
    tags: ["SpA", "radiology", "imaging"]
  },
  {
    front: "What is sacroiliitis and how is it related to SpA?",
    back: "Sacroiliitis is inflammation of the sacroiliac joints, with or without spondylitis. It is a hallmark feature of SpA and can progress from early inflammation to erosions, sclerosis, and eventual fusion of the joints.",
    tags: ["SpA", "sacroiliitis", "pathology"]
  },
  {
    front: "What is the ASAS classification criteria for axial spondyloarthropathies?",
    back: "Entry criteria: Back pain with onset less than 45 years, chronic (3+ months). Classification requires either: (1) Sacroiliitis on imaging plus 1+ SpA feature, OR (2) HLA B27 positive plus 2+ SpA features. SpA features include inflammatory back pain, arthritis, enthesitis, uveitis, dactylitis, psoriasis, Crohn's or colitis, good response to NSAIDs, family history, HLA B27 positivity, and elevated CRP.",
    tags: ["SpA", "ASAS-criteria", "classification"]
  },
  {
    front: "What are the key characteristics of inflammatory back pain in SpA?",
    back: "Inflammatory back pain: (1) Occurs in patients less than 40-45 years, (2) Insidious onset, (3) Chronic (3+ months), (4) Morning stiffness upon arising, (5) Pain improves during the day or with exercise, (6) Does not improve with rest, (7) Often associated with nocturnal pain and waking at night.",
    tags: ["SpA", "inflammatory-back-pain", "clinical-features"]
  },
  {
    front: "What is the significance of HLA B27 in spondyloarthropathies?",
    back: "HLA B27 is a major genetic predisposition marker for SpA with greater than 90% association with ankylosing spondylitis, 85% with reactive arthritis, 50% with inflammatory bowel disease-related SpA, and 50% with psoriatic arthritis spondylitis. However, only 2% of HLA B27 positive individuals develop ankylosing spondylitis; prevalence rises to approximately 20% if both the patient and a first-degree relative are HLA B27 positive.",
    tags: ["SpA", "HLA-B27", "genetics"]
  },
  {
    front: "What are the ethnic variations in HLA B27 prevalence?",
    back: "In South Africa: Caucasians 8.56%, African population 4%, Colored population 3.3%, Indian population 2.2%. This ethnic variation affects the prevalence and clinical presentation of SpA in different populations.",
    tags: ["SpA", "HLA-B27", "epidemiology"]
  },
  {
    front: "What is the role of HLA B27 testing in SpA diagnosis?",
    back: "HLA B27 testing: (1) Assists in clinical diagnosis when clinical suspicion exists, (2) NOT a routine screening or confirmatory test, (3) NOT a screening test in the general population, (4) Useful in appropriate clinical settings with high specificity for certain diseases like ankylosing spondylitis, (5) Cannot distinguish between different types of SpA, (6) Prevalence is relatively low in general population.",
    tags: ["SpA", "HLA-B27", "diagnostic-testing"]
  },
  {
    front: "What is the prevalence of ankylosing spondylitis?",
    back: "General population: approximately 0.2% prevalence. In HLA B27 positive individuals: only approximately 2% develop ankylosing spondylitis. In HLA B27 positive individuals with a first-degree relative who is HLA B27 positive: approximately 20% develop ankylosing spondylitis.",
    tags: ["SpA", "ankylosing-spondylitis", "epidemiology"]
  },
  {
    front: "What are the Modified New York criteria for ankylosing spondylitis?",
    back: "The criteria assess: (1) History of inflammatory back pain, (2) Limitation of motion of the lumbar spine (extension, flexion, and bending forward), (3) Chest expansion relative to standard values for age and sex (normal approximately 5cm), (4) Definite sacroiliitis on X-ray.",
    tags: ["SpA", "ankylosing-spondylitis", "diagnostic-criteria"]
  },
  {
    front: "What is enthesopathy and which sites are commonly affected?",
    back: "Enthesopathy is inflammation at the insertion point of tendons, ligaments, or articular capsules to bone. Common sites in SpA include: (1) Ischial tuberosity, (2) Tibial tubercle, (3) Anterior patellar crista, (4) ASIS (anterior superior iliac spine), (5) Iliac crest, (6) Malleoli, (7) Plantar aspect of heel (calcaneus), (8) Spinous processes of vertebrae.",
    tags: ["SpA", "enthesopathy", "clinical-features"]
  },
  {
    front: "What are the peripheral joint manifestations of SpA?",
    back: "Peripheral manifestations include: (1) Asymmetrical arthritis, (2) Large joint involvement (hip, knee, ankle, foot), (3) Small joint involvement possible, (4) Interphalangeal joint arthritis, (5) Dactylitis (sausage digits), (6) Acolysthenosynovitis, (7) Plantar fasciitis, (8) Costochondritis, (9) Iritis, (10) Mucocutaneous lesions.",
    tags: ["SpA", "peripheral-arthritis", "clinical-features"]
  },
  {
    front: "What are the extra-articular manifestations of SpA?",
    back: "Extra-articular manifestations include: (1) Uveitis (eye involvement), (2) Skin lesions/mucocutaneous lesions (specific to reactive arthritis), (3) Aortitis (inflammation of aorta), (4) Conduction abnormalities (cardiac), (5) Iritis, (6) Inflammatory bowel disease features.",
    tags: ["SpA", "extra-articular-manifestations", "systemic-features"]
  },
  {
    front: "What are the serology findings in spondyloarthropathies?",
    back: "Characteristic serology in SpA: (1) Negative rheumatoid factor, (2) Negative anti-nuclear antibodies, (3) No rheumatoid nodules, (4) May have elevated CRP, (5) HLA B27 positive in many cases. These negative serology markers help differentiate SpA from rheumatoid arthritis.",
    tags: ["SpA", "serology", "laboratory-findings"]
  },
  {
    front: "What is the first-line drug therapy for SpA?",
    back: "First-line therapy is non-steroidal anti-inflammatory drugs (NSAIDs), either intermittent or continuous. For spinal pain, continuous NSAID dosing for at least 3 months is recommended before moving to next-line treatment. Analgesics and muscle relaxants are sometimes used as adjuncts.",
    tags: ["SpA", "treatment", "NSAIDs"]
  },
  {
    front: "What are the disease-modifying therapies used in SpA?",
    back: "Conventional DMARDs like sulfasalazine and methotrexate are mainly used for peripheral arthritis treatment but have limited efficacy for axial joint involvement. Anti-TNF therapies (e.g., TNF-alpha inhibitors like etanercept, infliximab) are the first-line biologic therapy after NSAIDs, especially for axial involvement resistant to NSAIDs.",
    tags: ["SpA", "treatment", "DMARDs", "anti-TNF"]
  },
  {
    front: "What are the clinical features of psoriatic arthritis?",
    back: "Psoriatic arthritis: (1) Inflammatory arthritis, (2) Involves distal interphalangeal (DIP) joints (distinguishes from rheumatoid arthritis), (3) Often asymmetrical, (4) Associated with dactylitis (sausage digits), (5) Nail involvement with nail-pitting and onycholysis, (6) No nodules, (7) Negative rheumatoid factor.",
    tags: ["psoriatic-arthritis", "clinical-features"]
  },
  {
    front: "What are the X-ray findings in psoriatic arthritis?",
    back: "X-ray findings include: (1) Erosive arthritis without osteopenia, (2) Sacroiliac joint involvement (often asymptomatic), (3) Syndesmophyte formation and parvertebral ossification, (4) Enthesopathy, (5) Distal interphalangeal joint involvement with extensive erosions, (6) Pencil-in-cup lesions with severe erosions, (7) Possible arthritis mutilans with digit shortening and telescoping.",
    tags: ["psoriatic-arthritis", "radiology", "imaging"]
  },
  {
    front: "What are the patterns of joint involvement in psoriatic arthritis?",
    back: "Five patterns: (1) Axial joint involvement, (2) Distal interphalangeal joint arthritis, (3) Oligo-articular (4 or fewer joints) asymmetrical arthritis, (4) Small joint symmetrical polyarticular pattern, (5) Arthritis mutilans (deforming arthritis).",
    tags: ["psoriatic-arthritis", "patterns", "classification"]
  },
  {
    front: "What is the treatment approach for psoriatic arthritis?",
    back: "Treatment: (1) NSAIDs for pain and inflammation, (2) Sulfasalazine and methotrexate for peripheral arthritis, (3) Anti-TNF therapies for dactylitis, enthesitis, and axial involvement, (4) Newer biologics: Interleukin-23 inhibitors (ustekinumab) and Interleukin-17 inhibitors (secukinumab).",
    tags: ["psoriatic-arthritis", "treatment", "biologics"]
  },
  {
    front: "What is reactive arthritis and how does it differ from septic arthritis?",
    back: "Reactive arthritis is a spondylarthropathy following a urogenital or gastrointestinal infection. Reactive arthritis is immunologically mediated inflammation of joints following distant infection without organism in the joint; Septic arthritis is direct infection within the joint itself.",
    tags: ["reactive-arthritis", "definition", "pathophysiology"]
  },
  {
    front: "What are the triggering organisms for reactive arthritis?",
    back: "Common triggering organisms include: (1) Chlamydia, (2) Yersinia, (3) Salmonella. These organisms cause urogenital or gastrointestinal infections that precede the immunologically mediated reactive arthritis.",
    tags: ["reactive-arthritis", "etiology", "organisms"]
  },
  {
    front: "What is the classic triad of reactive arthritis?",
    back: "The classic triad consists of: (1) Ocular involvement (conjunctivitis), (2) Arthritis, (3) Urethritis. This triad is the hallmark presentation of reactive arthritis.",
    tags: ["reactive-arthritis", "clinical-presentation", "triad"]
  },
  {
    front: "What are the mucocutaneous manifestations of reactive arthritis?",
    back: "Mucocutaneous manifestations include: (1) Keratoderma blennorrhagicum (papulosquamous rash affecting palms and soles), (2) Nail dystrophy, (3) Circinate balanitis (shallow ulcers on glans or shaft of penis), (4) Oral ulcers (typically painless on hard palate or tongue).",
    tags: ["reactive-arthritis", "mucocutaneous-manifestations", "skin-features"]
  },
  {
    front: "What is the treatment for chlamydia-induced reactive arthritis?",
    back: "Chlamydia-induced reactive arthritis requires prolonged antibiotic treatment with agents such as tetracyclines, doxycycline, or erythromycin. This reduces post-chlamydia arthritis from 37% to 10%.",
    tags: ["reactive-arthritis", "chlamydia", "treatment", "antibiotics"]
  },
  {
    front: "What is enteropathic spondylarthropathy?",
    back: "Enteropathic spondylarthropathy is arthritis accompanying inflammatory bowel diseases (Crohn's disease and ulcerative colitis). Arthritis occurs in 10-22% of IBD patients, with higher prevalence in Crohn's disease than ulcerative colitis.",
    tags: ["enteropathic-arthritis", "IBD", "inflammatory-bowel-disease"]
  },
  {
    front: "What is the temporal relationship between arthritis and gastrointestinal symptoms?",
    back: "Arthritis may occur before gastrointestinal symptoms by a lengthy period, initially classified as undifferentiated spondylarthropathy until inflammatory bowel disease becomes apparent later. Arthritis typically presents as prosarticular (few joint involvement), asymmetric, involving one side of the body.",
    tags: ["enteropathic-arthritis", "timing", "clinical-presentation"]
  },
  {
    front: "What is the relationship between enteropathic arthritis activity and bowel inflammation?",
    back: "The activity of peripheral arthritis generally correlates well with the degree of active bowel inflammation, particularly in ulcerative colitis. If the patient has active bowel disease, they will also have swollen and tender joints.",
    tags: ["enteropathic-arthritis", "correlation", "disease-activity"]
  },
  {
    front: "What are the extra-articular complications of enteropathic spondylarthropathy?",
    back: "Non-articular complications include: (1) Skin manifestations: pyoderma gangrenosum, erythema nodosum, (2) Eye manifestations: anterior uveitis, (3) Associated features of inflammatory bowel disease.",
    tags: ["enteropathic-arthritis", "extra-articular-complications", "systemic-features"]
  },
  {
    front: "What is the treatment approach for enteropathic spondylarthropathy?",
    back: "Treatment: (1) NSAIDs for axial pain and lower back pain (use with caution in IBD), (2) Sulfasalazine for peripheral arthritis, (3) Steroids for peripheral arthritis, (4) Anti-TNF drugs (particularly infliximab) benefit both arthritis and inflammatory bowel disease.",
    tags: ["enteropathic-arthritis", "treatment", "NSAIDs", "anti-TNF"]
  },
  {
    front: "What are the spinal manifestations of enteropathic spondylarthropathy?",
    back: "Spinal manifestations include syndesmophytes (bony bridges) that cross from one vertebral body to another, extending on either side of vertebrae, eventually progressing to involve more vertebral bodies and resulting in complete fusion and stiffening of the spine.",
    tags: ["enteropathic-arthritis", "spinal-involvement", "imaging"]
  },
  {
    front: "What is the difference between mechanical and inflammatory back pain?",
    back: "Mechanical back pain is differentiated from inflammatory back pain in SpA by: (1) Age of onset (inflammatory less than 40-45 years), (2) Insidious vs acute onset, (3) Chronic duration (3+ months), (4) Morning stiffness pattern and improvement with activity, (5) Nocturnal pain, (6) No improvement with rest.",
    tags: ["back-pain", "differentiation", "clinical-assessment"]
  },
  {
    front: "What are the vertebral erosive changes seen in SpA?",
    back: "Early erosive changes at the corners of vertebral bodies are associated with SpA, with formation of syndesmophytes at the edge of vertebral bodies, progressing to bridge adjacent vertebrae and eventually resulting in bamboo spine with complete vertebral fusion.",
    tags: ["SpA", "vertebral-pathology", "imaging"]
  }
];

const outputDir = 'D:/corpus/rheumatology/srs-cards';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

let yamlContent = '';
cards.forEach(card => {
  yamlContent += '- front: "' + card.front.replace(/"/g, '\\"') + '"\n';
  yamlContent += '  back: "' + card.back.replace(/"/g, '\\"') + '"\n';
  yamlContent += '  tags: [' + card.tags.map(t => '"' + t + '"').join(', ') + ']\n\n';
});

const outputFile = path.join(outputDir, 'Spondyloarthropathies - CMED4IIM1 - 2026_pages-001-007.yml');
fs.writeFileSync(outputFile, yamlContent, 'utf-8');

console.log('Generated ' + cards.length + ' SRS cards');
console.log('Output file: ' + outputFile);
console.log('File size: ' + fs.statSync(outputFile).size + ' bytes');
