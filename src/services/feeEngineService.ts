import { supabase } from '../lib/supabase';
import {
  FeeCalculator,
  CalculatorAdapter,
  type ScenarioInput,
  type ScenarioResult,
  type JurisdictionRule,
  type DealerConfig,
  type CalculatorState,
} from '../../packages/fee-engine/src';

/**
 * Fee Engine Service
 *
 * Integrates the DMS fee engine with the Brandon's Calculator application.
 * Fetches jurisdiction rules and dealer configs from Supabase, then calculates fees.
 */
export class FeeEngineService {
  private calculator: FeeCalculator;
  private adapter: CalculatorAdapter;
  private rulesCache: Map<string, JurisdictionRule[]> = new Map();
  private dealerConfigCache: Map<string, DealerConfig> = new Map();

  constructor() {
    this.calculator = new FeeCalculator();
    this.adapter = new CalculatorAdapter();
  }

  /**
   * Calculate fees for current calculator state
   *
   * @param calculatorState - Current state from calculator store
   * @param dealerId - Dealer ID (defaults to 'default')
   * @returns Complete scenario result with fees and taxes
   */
  async calculateFees(
    calculatorState: CalculatorState,
    dealerId: string = 'default'
  ): Promise<ScenarioResult> {
    try {
      // 1. Convert calculator state to ScenarioInput
      const scenarioInput = this.adapter.mapToScenarioInput(calculatorState, dealerId);

      // 2. Fetch jurisdiction rules
      const jurisdictionRules = await this.getJurisdictionRules(
        scenarioInput.jurisdiction.stateCode,
        scenarioInput.jurisdiction.countyName
      );

      // 3. Fetch dealer config
      const dealerConfig = await this.getDealerConfig(dealerId);

      // 4. Calculate fees
      const result = await this.calculator.calculate(
        scenarioInput,
        jurisdictionRules,
        dealerConfig
      );

      console.log('[FeeEngineService] Calculation complete:', {
        scenarioType: result.detectedScenario.type,
        totalFees: result.totals.totalFees,
        salesTax: result.totals.salesTax,
      });

      return result;
    } catch (error) {
      console.error('[FeeEngineService] Calculation error:', error);
      throw new Error(`Fee calculation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get jurisdiction rules from Supabase (with caching)
   */
  private async getJurisdictionRules(
    stateCode: string,
    countyName?: string
  ): Promise<JurisdictionRule[]> {
    const cacheKey = `${stateCode}_${countyName || 'state'}`;

    // Check cache first
    if (this.rulesCache.has(cacheKey)) {
      console.log('[FeeEngineService] Using cached jurisdiction rules');
      return this.rulesCache.get(cacheKey)!;
    }

    console.log('[FeeEngineService] Fetching jurisdiction rules from Supabase...');

    // Fetch from Supabase
    const { data, error } = await supabase
      .from('jurisdiction_rules')
      .select('*')
      .eq('state_code', stateCode)
      .or(`county_name.is.null,county_name.eq.${countyName || ''}`)
      .lte('effective_date', new Date().toISOString())
      .or(`expiration_date.is.null,expiration_date.gte.${new Date().toISOString()}`);

    if (error) {
      console.error('[FeeEngineService] Error fetching jurisdiction rules:', error);
      throw new Error(`Failed to fetch jurisdiction rules: ${error.message}`);
    }

    const rules = (data || []) as unknown as JurisdictionRule[];

    // Cache for 5 minutes
    this.rulesCache.set(cacheKey, rules);
    setTimeout(() => this.rulesCache.delete(cacheKey), 5 * 60 * 1000);

    console.log(`[FeeEngineService] Loaded ${rules.length} jurisdiction rules`);

    return rules;
  }

  /**
   * Get dealer config from Supabase (with caching)
   */
  private async getDealerConfig(dealerId: string): Promise<DealerConfig> {
    // Check cache first
    if (this.dealerConfigCache.has(dealerId)) {
      console.log('[FeeEngineService] Using cached dealer config');
      return this.dealerConfigCache.get(dealerId)!;
    }

    console.log('[FeeEngineService] Fetching dealer config from Supabase...');

    // Fetch from Supabase
    const { data, error } = await supabase
      .from('dealer_fee_configs')
      .select('*')
      .eq('dealer_id', dealerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      console.error('[FeeEngineService] Error fetching dealer config:', error);
    }

    // If no config found, use default
    if (!data) {
      console.log('[FeeEngineService] No dealer config found, using defaults');
      return this.getDefaultDealerConfig(dealerId);
    }

    const config = data as unknown as DealerConfig;

    // Cache for 10 minutes
    this.dealerConfigCache.set(dealerId, config);
    setTimeout(() => this.dealerConfigCache.delete(dealerId), 10 * 60 * 1000);

    return config;
  }

  /**
   * Get default dealer config (fallback)
   */
  private getDefaultDealerConfig(dealerId: string): DealerConfig {
    return {
      id: 'default',
      dealerId: dealerId,
      configVersion: 'v1',
      configData: {
        packages: [
          {
            packageId: 'retail_default',
            packageName: 'Retail Default',
            description: 'Standard retail dealer fees',
            fees: [
              {
                code: 'DOC_FEE',
                description: 'Documentation Fee',
                amount: 699.0,
                taxable: false,
                required: true,
              },
              {
                code: 'DEALER_PREP',
                description: 'Dealer Preparation Fee',
                amount: 495.0,
                taxable: false,
                required: true,
              },
            ],
          },
        ],
        defaultPackageId: 'retail_default',
      },
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.rulesCache.clear();
    this.dealerConfigCache.clear();
    console.log('[FeeEngineService] Cache cleared');
  }
}

// Export singleton instance
export const feeEngineService = new FeeEngineService();
