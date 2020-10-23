import { Config, Context } from "semantic-release";
import { PluginConfig } from "./plugin-config";
import { PackageInfoRetriever } from "./package-info-retriever";
import { Action, Rule, RuleWithAppliedOptions } from "./rule";
import { supportLatest } from "./rules/support-latest";
import { deprecateAll } from "./rules/deprecate-all";
import { RuleApplier } from "./rule-applier";
import { SemVer } from "semver";
import { Deprecier } from "./deprecier";
import {
  DepreciationResult,
  RuleApplicationResult,
} from "./rule-application-result";
import { Authentifier } from "./authentifier";
import { supportPreReleaseIfNotReleased } from "./rules/support-prerelease-if-not-released";
import ConfigurationLoader from "./configuration-loader";
import { Logger } from "./logger";
import { PackageInfo } from "./package-info";

export class OldVersionDeprecier {
  private rules: RuleWithAppliedOptions[] = [];

  constructor(
    private readonly packageInfoRetriever: PackageInfoRetriever,
    private readonly ruleApplier: RuleApplier,
    private readonly deprecier: Deprecier,
    private readonly authentifier: Authentifier,
    private readonly configurationLoader: ConfigurationLoader
  ) {
    this.packageInfoRetriever = packageInfoRetriever;
    this.ruleApplier = ruleApplier;
    this.deprecier = deprecier;
    this.authentifier = authentifier;
  }

  public async verifyConditions(
    pluginConfig: PluginConfig,
    context: Context & Config
  ): Promise<void> {
    this.rules = this.configurationLoader.generateRules(pluginConfig);
  }

  public async publish(
    pluginConfig: PluginConfig,
    context: Context & Config
  ): Promise<void> {
    const { logger, cwd, env } = context;
    const packageInfo = await this.packageInfoRetriever.getInfo({
      cwd,
      env,
      logger,
    });

    if (!packageInfo) {
      return;
    }

    const parsedVersions = packageInfo.versions.map((v) => new SemVer(v));
    const actionsOnVersions = this.ruleApplier.applyRules(
      parsedVersions,
      this.rules
    );

    this.deprecate(actionsOnVersions, packageInfo, context);
  }

  private async deprecate(
    actionsOnVersions: RuleApplicationResult[],
    packageInfo: PackageInfo,
    context: Context & Config
  ) {
    const depreciations: DepreciationResult[] = actionsOnVersions
      .filter((actionOnVersion) => actionOnVersion.action === Action.deprecate)
      .map((actionsOnVersion) => actionsOnVersion as DepreciationResult);

    if (depreciations) {
      context.logger.log(
        "Versions to deprecate",
        ...depreciations.map((v) => v.version.format())
      );

      await this.authentifier.authentify(context);
      for (const depreciation of depreciations) {
        await this.deprecier.deprecate(packageInfo, depreciation, context);
      }
    } else {
      context.logger.log("No version to deprecate");
    }
  }
}
