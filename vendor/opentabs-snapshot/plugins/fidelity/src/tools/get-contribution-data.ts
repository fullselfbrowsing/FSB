import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { contributionSchema } from './schemas.js';

export const getContributionData = defineTool({
  name: 'get_contribution_data',
  displayName: 'Get Contribution Data',
  description:
    'Get IRA and HSA contribution limits, year-to-date contributions, and catch-up eligibility for retirement accounts. Shows both current and prior year data.',
  summary: 'View IRA/HSA contribution limits and YTD',
  icon: 'piggy-bank',
  group: 'Retirement',
  input: z.object({
    account_number: z.string().min(1).describe('Account number for the retirement account'),
  }),
  output: z.object({
    contribution: contributionSchema.describe('Contribution data'),
  }),
  handle: async params => {
    interface ContribResponse {
      getContribAcctDetail: {
        currentYear?: number;
        priorYear?: number;
        priorYearContribCutoffDate?: string;
        custContribDetails?: Array<{
          retirementRollupDetails?: {
            custCurrentYear?: {
              individualContribYTD?: number;
              individualLimit?: number;
              employerContribYTD?: number;
              employerLimit?: number;
              ovrContrAgeFlg?: boolean;
            };
          };
          hsaRollupDetails?: {
            custCurrentYear?: {
              individualContribYTD?: number;
              individualLimit?: number;
              employerContribYTD?: number;
              ovrContrAgeFlg?: boolean;
            };
          };
        }>;
      };
    }

    const acctNum = params.account_number;

    const query = `query GetContributionData {
      getContribAcctDetail(srcSys: "RETR", acctContribDetails: [{acctNum: "${acctNum}", acctType: "Brokerage"}]) {
        currentYear priorYear priorYearContribCutoffDate
        custContribDetails {
          retirementRollupDetails {
            custCurrentYear {
              individualContribYTD individualLimit employerLimit employerContribYTD ovrContrAgeFlg
              __typename
            }
            __typename
          }
          hsaRollupDetails {
            custCurrentYear {
              individualContribYTD individualLimit employerContribYTD ovrContrAgeFlg
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
    }`;

    const data = await portfolioGraphql<ContribResponse>('GetContributionData', query);

    const detail = data.getContribAcctDetail;
    const contrib = detail?.custContribDetails?.[0];
    const retirement = contrib?.retirementRollupDetails?.custCurrentYear;
    const hsa = contrib?.hsaRollupDetails?.custCurrentYear;
    const src = retirement ?? hsa;

    return {
      contribution: {
        current_year: detail?.currentYear ?? 0,
        prior_year: detail?.priorYear ?? 0,
        prior_year_cutoff_date: detail?.priorYearContribCutoffDate ?? '',
        individual_contrib_ytd: src?.individualContribYTD ?? 0,
        individual_limit: src?.individualLimit ?? 0,
        employer_contrib_ytd: src?.employerContribYTD ?? 0,
        employer_limit: retirement?.employerLimit ?? 0,
        is_catch_up_eligible: src?.ovrContrAgeFlg ?? false,
      },
    };
  },
});
