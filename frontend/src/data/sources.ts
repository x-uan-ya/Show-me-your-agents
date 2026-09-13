// Central citation/source configuration.
//
// These are the Singapore MARKET-CONTEXT datasets used only to design realistic
// client/scenario context and to describe the broader F&B market. They are NOT
// customer feedback and must never be presented as evidence for an individual
// customer insight. See the Sources & Methodology page.
//
// Do not invent sources, licenses, URLs, or dataset details. Every entry below
// is transcribed from the project's confirmed dataset list.

export type SourceUsageType =
  | "market_context"
  | "demographic_context"
  | "research_context";

export interface DataSource {
  id: string;
  datasetName: string;
  provider: string;
  purpose: string;
  license: string;
  url: string;
  usageType: SourceUsageType;
}

// "Dataset 2 — Singapore Market Context": supporting context only.
export const DATA_SOURCES: DataSource[] = [
  {
    id: "sfa-licensed-establishments",
    datasetName: "Licensed Food Establishments",
    provider: "Singapore Food Agency / data.gov.sg",
    purpose:
      "Singapore-specific F&B business landscape and realistic multi-client scenario design.",
    license: "Singapore Open Data Licence",
    url: "https://data.gov.sg/datasets/d_a9e81ab29216b10b69e23e7957b680b9/view",
    usageType: "market_context",
  },
  {
    id: "fnb-index-chained-volume",
    datasetName: "F&B Services Index - Chained Volume Terms",
    provider: "Singapore Department of Statistics / data.gov.sg",
    purpose: "Singapore F&B industry activity and trend context.",
    license: "Singapore Open Data Licence",
    url: "https://data.gov.sg/datasets/d_29d0626a2259ac6c3695e470451ab4d2/view",
    usageType: "market_context",
  },
  {
    id: "fnb-index-current-prices",
    datasetName: "F&B Services Index - Current Prices",
    provider: "Singapore Department of Statistics / data.gov.sg",
    purpose: "Nominal F&B sales/activity context.",
    license: "Singapore Open Data Licence",
    url: "https://data.gov.sg/datasets/d_f2a6e31b801445350bbeda1c895d455e/view",
    usageType: "market_context",
  },
  {
    id: "online-fnb-sales-proportion",
    datasetName: "Online Food & Beverage Sales Proportion",
    provider: "Singapore Department of Statistics / data.gov.sg",
    purpose:
      "Context on the role of online channels in Singapore F&B services.",
    license: "Singapore Open Data Licence",
    url: "https://data.gov.sg/datasets/d_1ee399b195ab799a34588772ccc1ebfa/view",
    usageType: "market_context",
  },
  {
    id: "sg-population-planning-area",
    datasetName: "Singapore Population by Planning Area, Age Group and Sex",
    provider: "Singapore Department of Statistics / data.gov.sg",
    purpose:
      "Broad demographic context for scenario design and audience assumptions.",
    license: "Singapore Open Data Licence",
    url: "https://data.gov.sg/datasets/d_d95ae740c0f8961a0b10435836660ce0/view",
    usageType: "demographic_context",
  },
  {
    id: "csisg-2022",
    datasetName: "CSISG 2022 Full Year Data",
    provider: "Singapore Management University",
    purpose: "Singapore customer-satisfaction research and methodology context.",
    license: "CC BY-NC 4.0",
    url: "https://researchdata.smu.edu.sg/articles/dataset/CSISG_2022_Full_Year_data_Q1_-_Retail_Infocomm_Q2_Land_Transport_Q3_F_B_and_Attractions_Q4_Finance_and_Insurance/24420823",
    usageType: "research_context",
  },
];

// Human-readable labels for usage types (kept out of components for reuse).
export const USAGE_TYPE_LABELS: Record<SourceUsageType, string> = {
  market_context: "Market context",
  demographic_context: "Demographic context",
  research_context: "Research context",
};

export function getDataSource(id: string): DataSource | undefined {
  return DATA_SOURCES.find((source) => source.id === id);
}

// Shared methodology + scope statements (single source of truth for copy).
export const METHODOLOGY_NOTE =
  "Customer insights are generated from the supplied customer-feedback records " +
  "and linked to supporting evidence from those records. Singapore market " +
  "datasets provide contextual information only and should not be interpreted " +
  "as proof of individual customer preferences.";

export const MARKET_CONTEXT_SCOPE_NOTE =
  "Singapore market datasets are used as contextual evidence for industry, " +
  "channel, demographic and customer-satisfaction research context. They are " +
  "not treated as individual customer feedback and are not used to claim that a " +
  "particular customer preference is representative of Singapore consumers.";
