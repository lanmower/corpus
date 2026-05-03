const fs = require('fs');
const path = require('path');

const cards = [
  {
    id: 'card-01',
    front: 'What is the global epidemiology of lung cancer?',
    back: 'Lung cancer is the second most commonly diagnosed cancer worldwide and the leading cause of cancer death for both men and women. It accounts for 1.8 million deaths worldwide.',
    topic: 'epidemiology'
  },
  {
    id: 'card-02',
    front: 'What is the epidemiology of lung cancer in South Africa?',
    back: 'Lung cancer is the third most common cancer in men and the ninth most common cancer in women in South Africa.',
    topic: 'epidemiology'
  },
  {
    id: 'card-03',
    front: 'At what stage is lung cancer frequently diagnosed?',
    back: 'Lung cancer is frequently diagnosed in advanced stages of disease, which contributes to low five-year survival rates and poor prognosis.',
    topic: 'prognosis'
  },
  {
    id: 'card-04',
    front: 'What is the National Lung Screening Trial?',
    back: 'A study comparing low-dose CT and chest X-ray screening in high-risk individuals (55-74 years old, current or former smokers with 30-pack-year history). It showed a 20% decrease in lung cancer mortality with low-dose CT compared to chest X-ray.',
    topic: 'screening'
  },
  {
    id: 'card-05',
    front: 'What is the most important risk factor for lung cancer?',
    back: 'Cigarette smoking is the most important risk factor, associated with causation in up to 90% of cases. It is the number one modifiable risk factor for lung cancer.',
    topic: 'risk-factors'
  },
  {
    id: 'card-06',
    front: 'How many carcinogens are found in a single cigarette?',
    back: 'There are more than 300 chemicals in one cigarette, 60 of which are known carcinogens. Examples include nitrosamines and polycyclic aromatic hydrocarbons.',
    topic: 'risk-factors'
  },
  {
    id: 'card-07',
    front: 'How do carcinogens in cigarette smoke cause lung cancer?',
    back: 'Carcinogens cause DNA damage and mutations within tumor suppressor genes, which interrupt DNA repair and cell cycle regulation mechanisms, leading to tumor formation.',
    topic: 'pathophysiology'
  },
  {
    id: 'card-08',
    front: 'How does duration versus intensity of smoking affect lung cancer risk?',
    back: 'For patients with similar smoking histories, longer duration of smoking puts them at greater risk of cancer compared with higher intensity of smoking.',
    topic: 'risk-factors'
  },
  {
    id: 'card-09',
    front: 'What is the relative lung cancer risk in current smokers?',
    back: 'Current smokers have the highest risk. Persistent smokers have a 16-fold elevated lung cancer risk, which is further doubled in those who started smoking younger than 16 years of age.',
    topic: 'risk-factors'
  },
  {
    id: 'card-10',
    front: 'How does smoking cessation affect lung cancer risk?',
    back: 'Smoking cessation lowers the risk of lung cancer. The relative risk remains high in the first 10 years after cessation and gradually declines to approximately 2-fold at 30 years after cessation.',
    topic: 'risk-factors'
  },
  {
    id: 'card-11',
    front: 'Do modern cigarette formulations reduce lung cancer risk?',
    back: 'No. Modern cigarette formulations do not reduce the risk of developing lung cancer; they appear to increase the risk.',
    topic: 'risk-factors'
  },
  {
    id: 'card-12',
    front: 'What percentage of lung cancer cases occur in past smokers?',
    back: 'Almost 50% of lung cancer cases develop in past smokers, explained by the persistence of elevated risk for many years after smoking cessation.',
    topic: 'epidemiology'
  },
  {
    id: 'card-13',
    front: 'How does cardiorespiratory fitness affect lung cancer risk in smokers?',
    back: 'Strong cardiorespiratory fitness may help reduce lung cancer risk in cigarette smokers and former smokers. Higher fitness levels are associated with lower incidence of lung cancer and better survival if lung cancer develops.',
    topic: 'risk-factors'
  },
  {
    id: 'card-14',
    front: 'What is second-hand smoke and its lung cancer risk?',
    back: 'Second-hand smoke is carcinogenic smoke inhaled passively by non-smokers. Urinary levels of carcinogens in non-smokers are 1-5% of those in active smokers. Approximately 25% of lung cancers in non-smokers are believed to be caused by second-hand smoke.',
    topic: 'risk-factors'
  },
  {
    id: 'card-15',
    front: 'What other risk factors contribute to lung cancer development?',
    back: 'Age, male gender, occupational exposures, diet low in fresh fruit and vegetables and fiber, low physical activity, radon exposure, asbestos exposure, HIV infection, and exposure to beryllium, nickel, copper, chromium, and cadmium.',
    topic: 'risk-factors'
  },
  {
    id: 'card-16',
    front: 'Are there lung cancers in never-smokers?',
    back: 'Yes. A minority of lung cancers develop in people who have never smoked. These are genetically distinct from smoking-related lung cancers and often have detectable genetic mutations amenable to targeted therapy. They have a better prognosis.',
    topic: 'pathophysiology'
  },
  {
    id: 'card-17',
    front: 'What is the relative risk of lung cancer with family history?',
    back: 'A family history of lung cancer is associated with approximately a 2-fold increased risk of lung cancer development.',
    topic: 'risk-factors'
  },
  {
    id: 'card-18',
    front: 'What is radon and its association with lung cancer?',
    back: 'Radon is an inert gas produced from uranium decay, present in the environment. It is well-established as a risk factor in uranium miners. Approximately 2-3% of lung cancers annually are estimated to be caused by radon exposure. However, household radon exposure has not been clearly shown to cause lung cancer.',
    topic: 'risk-factors'
  },
  {
    id: 'card-19',
    front: 'What is asbestos exposure and its lung cancer risk?',
    back: 'Asbestos exposure is strongly associated with lung cancer causation, increasing risk by up to 5 times. It is also associated with malignant pleural mesothelioma and pulmonary fibrosis.',
    topic: 'risk-factors'
  },
  {
    id: 'card-20',
    front: 'What is the synergistic risk of tobacco smoke and asbestos exposure?',
    back: 'Tobacco smoke and asbestos exposure act synergistically. The risk of developing lung cancer for persons who smoke tobacco and have asbestos exposure history approaches 80-90 times that of control populations.',
    topic: 'risk-factors'
  },
  {
    id: 'card-21',
    front: 'What is the relationship between HIV infection and lung cancer?',
    back: 'Persons with HIV infection have higher lung cancer risk than those without. In HIV-positive people, lung cancer is the most common and most fatal non-AIDS-associated malignancy. HIV infection appears to increase lung cancer risk independently by a factor of at least 2.5-fold.',
    topic: 'risk-factors'
  },
  {
    id: 'card-22',
    front: 'What histological type of lung cancer predominates in HIV-infected persons?',
    back: 'The majority of lung cancers in HIV-infected persons are adenocarcinomas (non-small cell carcinomas).',
    topic: 'histology'
  },
  {
    id: 'card-23',
    front: 'Did HAART change lung cancer incidence in HIV-infected persons?',
    back: 'In most studies, the incidence and risk of lung cancer in HIV-infected persons did not change significantly with the introduction of highly active antiretroviral therapy (HAART).',
    topic: 'epidemiology'
  },
  {
    id: 'card-24',
    front: 'What is unique about lung cancer in HIV-infected patients compared to the general population?',
    back: 'Lung cancer in HIV-infected persons develops almost exclusively in smokers, but HIV-infected patients with lung cancer are significantly younger and present with advanced disease and shorter median survival compared to the general population.',
    topic: 'epidemiology'
  },
  {
    id: 'card-25',
    front: 'What occupational exposures increase lung cancer risk?',
    back: 'Exposures to beryllium, nickel, copper, chromium, and cadmium increase lung cancer risk.',
    topic: 'risk-factors'
  },
  {
    id: 'card-26',
    front: 'What personal lung diseases increase lung cancer risk?',
    back: 'Personal history of lung disease that scars the lungs increases risk, including COPD, tuberculosis, and certain infections.',
    topic: 'risk-factors'
  },
  {
    id: 'card-27',
    front: 'What role do biomass fuels and cooking methods play in lung cancer risk?',
    back: 'Pollutants from cooking and heating with biomass fuel, burning coal indoors, burning wood indoors, cooking on wood stoves, and frying foods at high temperatures increase lung cancer risk.',
    topic: 'risk-factors'
  },
  {
    id: 'card-28',
    front: 'What is the evidence for dietary protective factors in lung cancer?',
    back: 'Dietary fiber and vegetables have been suggested as protective. However, trials of beta-carotene, vitamin E, and retinol palmitate supplementation in at-risk persons actually increased lung cancer incidence.',
    topic: 'risk-factors'
  },
  {
    id: 'card-29',
    front: 'What is the evidence for cannabis smoking and lung cancer risk?',
    back: 'Studies are showing that long-term cannabis smoking can increase the risk of lung cancer, but evidence is not yet as robust as for tobacco.',
    topic: 'risk-factors'
  },
  {
    id: 'card-30',
    front: 'What are global trends in lung cancer incidence?',
    back: 'Lung cancer incidence has followed smoking trends with a lag time of several decades. Incidence is declining in developed countries (USA, Canada, UK) but expected to increase in developing countries with increased smoking.',
    topic: 'epidemiology'
  },
  {
    id: 'card-31',
    front: 'What is the lung cancer trend in South Africa?',
    back: 'Lung cancer incidence is on an upward trend in South Africa. Notably, lung cancer incidence among women continues to increase despite very low smoking rates.',
    topic: 'epidemiology'
  },
  {
    id: 'card-32',
    front: 'Why do Chinese women have higher lung cancer incidence than European women?',
    back: 'Despite very low smoking rates, Chinese women have higher lung cancer incidence than European women, with higher incidence of genetic mutations causing lung cancer.',
    topic: 'epidemiology'
  },
  {
    id: 'card-33',
    front: 'How is lung cancer classified histologically?',
    back: 'Lung cancer is divided into small cell lung cancer (SCLC) and non-small cell lung cancer (NSCLC). NSCLC accounts for 85-90% and includes squamous cell carcinoma, adenocarcinoma, and large cell carcinoma.',
    topic: 'classification'
  },
  {
    id: 'card-34',
    front: 'How was small cell lung cancer traditionally staged?',
    back: 'Small cell lung cancer was traditionally staged as limited or extensive disease.',
    topic: 'staging'
  },
  {
    id: 'card-35',
    front: 'What are the characteristics of small cell lung cancer?',
    back: 'Small cell lung cancer: accounts for ~15% of all lung cancers; almost always in smokers; characterized by small round blue cells approximately twice the size of lymphocytes; usually centrally located; aggressive tumor that spreads quickly; often has distant metastases at diagnosis; more responsive to chemotherapy and radiotherapy but prognosis remains poor.',
    topic: 'histology'
  },
  {
    id: 'card-36',
    front: 'What are the characteristics of non-small cell lung cancer?',
    back: 'NSCLC: accounts for 85% of lung cancers; can be centrally or peripherally located; often peripherally located; can be fast or slow growing; staged using TNM staging; has improved survival with newer treatments.',
    topic: 'histology'
  },
  {
    id: 'card-37',
    front: 'What percentage of lung cancers is adenocarcinoma?',
    back: 'Adenocarcinoma accounts for 35-40% of non-small cell lung cancers. It is the most common type overall, most common in women, most common in non-smokers (though most patients are smokers), and usually peripheral.',
    topic: 'histology'
  },
  {
    id: 'card-38',
    front: 'What is the diagnostic implication of adenocarcinoma in non-smokers?',
    back: 'If a non-smoker is diagnosed with lung cancer, they almost certainly have adenocarcinoma.',
    topic: 'diagnosis'
  },
  {
    id: 'card-39',
    front: 'What percentage of non-small cell lung cancers is squamous cell carcinoma?',
    back: 'Squamous cell carcinoma accounts for approximately 30% of non-small cell carcinomas.',
    topic: 'histology'
  },
  {
    id: 'card-40',
    front: 'What are the characteristics of squamous cell carcinoma?',
    back: 'Squamous cell carcinoma: strongly associated with smoking; used to be the most common histological subtype but overtaken by adenocarcinoma; most common to cavitate; carries poor prognosis; usually central; difficult to resect because it grows into airways and close to mediastinal vessels.',
    topic: 'histology'
  },
  {
    id: 'card-41',
    front: 'What are large cell carcinomas?',
    back: 'Large cell carcinomas are the least common type of non-small cell lung cancers. They are usually peripherally located and very large, typically 1-4 centimeters on diagnosis.',
    topic: 'histology'
  },
  {
    id: 'card-42',
    front: 'How does lung cancer typically present early in disease?',
    back: 'Often lung cancer presents with no symptoms in early stages. Patients are asymptomatic until disease is advanced. In approximately 10% of cases, lung cancer is diagnosed incidentally on chest X-ray.',
    topic: 'clinical-presentation'
  },
  {
    id: 'card-43',
    front: 'What is the stage distribution at initial lung cancer diagnosis?',
    back: 'At initial diagnosis: 20% have localized disease, 25% have regional metastases to local structures and lymph nodes, and 55% (majority) have distant metastases.',
    topic: 'staging'
  },
  {
    id: 'card-44',
    front: 'What is the most common symptom of lung cancer?',
    back: 'Cough is the most common symptom. New onset or worsening cough in a smoker or former smoker should raise suspicion of lung cancer.',
    topic: 'clinical-presentation'
  },
  {
    id: 'card-45',
    front: 'What does hemoptysis indicate in lung cancer?',
    back: 'Hemoptysis (coughing up blood) is concerning for lung cancer.',
    topic: 'clinical-presentation'
  },
  {
    id: 'card-46',
    front: 'How does lung cancer cause dyspnea?',
    back: 'Dyspnea occurs due to: mass effect of tumor pressing on airways, inducing pleural effusion that causes lung collapse, and wheeze when tumor presses on airway lumen.',
    topic: 'clinical-presentation'
  },
  {
    id: 'card-47',
    front: 'What causes chest pain in lung cancer?',
    back: 'Chest pain develops when tumor invades outside the lung parenchyma into the pleura, ribs, and chest wall, or when enlarged lymph nodes compress surrounding structures.',
    topic: 'clinical-presentation'
  },
  {
    id: 'card-48',
    front: 'What causes hoarseness in lung cancer?',
    back: 'Hoarseness occurs when tumor compresses the recurrent laryngeal nerve around the trachea that innervates the vocal cords.',
    topic: 'clinical-presentation'
  },
  {
    id: 'card-49',
    front: 'What is superior vena cava syndrome?',
    back: 'Superior vena cava syndrome presents with headache, swelling of face, arms, and neck. It occurs when great vessels entering or exiting the chest are compressed by tumor, causing venous obstruction, blood vessel distension, and fluid backup in the region drained by the superior vena cava.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-50',
    front: 'What is a Pancoast tumor and what does it cause?',
    back: 'A Pancoast or superior sulcus tumor is located at the apex of the lung. It compresses the sympathetic plexus, causing Horner syndrome.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-51',
    front: 'What are the components of Horner syndrome?',
    back: 'Horner syndrome is characterized by: meiosis (persistently constricted pupil), ptosis (drooping of eyelid), and anhidrosis (inability to sweat on the same side as tumor). It does not cause problems with vision.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-52',
    front: 'What can result from progression of Pancoast tumors?',
    back: 'Progression can lead to brachial plexus involvement, causing arm and hand weakness.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-53',
    front: 'What are the most common sites of lung cancer metastases?',
    back: 'The most common sites for lung cancer metastases are bones, liver, brain, and adrenal glands.',
    topic: 'metastasis'
  },
  {
    id: 'card-54',
    front: 'How do bone metastases from lung cancer present?',
    back: 'Bone metastases present as localized bone pain or non-traumatic fractures due to bone weakness. Most commonly affected bones are spine, ribs, and pelvis.',
    topic: 'metastasis'
  },
  {
    id: 'card-55',
    front: 'How do liver metastases from lung cancer present?',
    back: 'Liver metastases present with jaundice, weakness, and weight loss.',
    topic: 'metastasis'
  },
  {
    id: 'card-56',
    front: 'How do brain metastases from lung cancer present?',
    back: 'Brain metastases present with a wide range of features including confusion, headache, nausea, vomiting, personality changes, and seizures.',
    topic: 'metastasis'
  },
  {
    id: 'card-57',
    front: 'What are paraneoplastic syndromes?',
    back: 'Paraneoplastic syndromes are clinical syndromes arising not from direct tumor effect (mass, invasion, metastases) but from immune response to tumor or tumor production of substances like hormones or cytokines that cause electrolyte abnormalities or hormone syndromes. They occur in 10-20% of lung cancer patients.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-58',
    front: 'Which lung cancer type most commonly causes paraneoplastic syndromes?',
    back: 'Most paraneoplastic syndromes are caused by small cell lung cancer, though they may also occur in non-small cell lung cancer.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-59',
    front: 'Which lung cancer type most commonly causes hypercalcemia?',
    back: 'Hypercalcemia is most commonly found in squamous cell carcinoma, though it can be caused by bony metastases or tumor secretion of parathyroid hormone-related peptide or calcitriol (usually from small cell lung cancer).',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-60',
    front: 'Which lung cancer types commonly cause clubbing and hypertrophic osteoarthropathy?',
    back: 'Clubbing and hypertrophic pulmonary osteoarthropathy are caused more frequently by adenocarcinomas.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-61',
    front: 'Which lung cancer type commonly causes thrombosis of hypercoagulability?',
    back: 'Thrombosis and hypercoagulability syndromes are caused more frequently by adenocarcinomas.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-62',
    front: 'What is SIADH in lung cancer?',
    back: 'SIADH (Syndrome of Inappropriate Antidiuretic Hormone) is more common in small cell lung cancer but can also occur in non-small cell lung cancer.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-63',
    front: 'Which lung cancer type commonly causes Cushing syndrome?',
    back: 'Cushing syndrome is more likely to occur in small cell lung cancer.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-64',
    front: 'What are the clinical manifestations of hypercalcemia in lung cancer?',
    back: 'Clinical manifestations are often referred to as "stones, bones, groans, and psychiatric bones" referring to renal calculi, bone pain, abdominal pain, polyuria, and signs of altered mental status. Common symptoms include weakness, fatigue, nausea, vomiting, and confusion.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-65',
    front: 'What is Lambert-Eaton syndrome in lung cancer?',
    back: 'Lambert-Eaton syndrome is caused by antibodies against small cell lung cancer that cross-react with voltage-gated calcium channels on motor neurons, damaging them and leading to proximal muscle weakness and other symptoms.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-66',
    front: 'What are the muscle symptoms of Lambert-Eaton syndrome?',
    back: 'Weakness of proximal muscles (difficulty raising arms, standing from seated), intraocular muscles (diplopia, ptosis), and pharyngeal muscles (slurred speech, dysphagia).',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-67',
    front: 'What are the autonomic symptoms of Lambert-Eaton syndrome?',
    back: 'Autonomic dysfunction results in dry mouth, blurred vision, impotence, and dizziness.',
    topic: 'paraneoplastic'
  },
  {
    id: 'card-68',
    front: 'What is the prevalence of Lambert-Eaton syndrome in small cell lung cancer?',
    back: 'Lambert-Eaton syndrome occurs in 1-3% of small cell lung cancers.',
    topic: 'paraneoplastic'
  }
];

const yaml = cards.map(card => {
  return `- id: ${card.id}
  front: "${card.front}"
  back: |
    ${card.back}
  review_count: 0
  difficulty: medium
  topic: ${card.topic}`;
}).join('\n\n');

const outputPath = 'D:\\corpus\\pulmonology\\srs-cards\\Lung Cancer - CMED4IIM1 - 2026_pages-001-010.yml';
fs.writeFileSync(outputPath, yaml);
console.log(`Created YAML file with ${cards.length} cards at ${outputPath}`);
