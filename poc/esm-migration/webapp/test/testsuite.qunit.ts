import type {SuiteConfiguration} from "sap/ui/test/starter/config";
export default {
	name: "QUnit test suite for the UI5 Application: sample.ts.app",
	defaults: {
		page: "ui5://test-resources/sample/ts/app/Test.qunit.html?testsuite={suite}&test={name}",
		qunit: {
			version: 2
		},
		sinon: {
			version: 4
		},
		ui5: {
			language: "EN",
			theme: "sap_horizon"
		},
		coverage: {
			only: ["sample/ts/app/"],
			never: ["test-resources/sample/ts/app/"]
		},
		loader: {
			paths: {
				"sample/ts/app": "../"
			}
		}
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for sample.ts.app"
		},
		"integration/opaTests": {
			title: "Integration tests for sample.ts.app"
		}
	}
} satisfies SuiteConfiguration;