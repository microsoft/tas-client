/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import {
    Filters,
    TargetPopulation,
    VSCodeFilterProvider,
} from '../src/vscode-tas-client/VSCodeFilterProvider';
import {
    AssignmentsFilters,
    VSCodeAssignmentsFilterProvider,
} from '../src/vscode-tas-client/VSCodeAssignmentsFilterProvider';
import { fakeVSCode } from './mocks/FakeVSCode';

describe('VS Code traffic filters', () => {
    it('maps all legacy headers to the host and extension metadata', () => {
        fakeVSCode.version = '1.95.0-insider';
        fakeVSCode.env.appName = 'Visual Studio Code - Insiders';
        fakeVSCode.env.machineId = 'stable-installation-id';
        fakeVSCode.env.language = 'zh-cn';
        const provider = new VSCodeFilterProvider(
            'publisher.my-extension',
            '2.3.4-preview',
            TargetPopulation.Insiders,
        );

        expect(Object.fromEntries(provider.getFilters())).toEqual({
            'X-MSEdge-Market': '',
            'X-FD-Corpnet': '',
            'X-VSCode-AppVersion': '1.95.0',
            'X-VSCode-Build': 'Visual Studio Code - Insiders',
            'X-MSEdge-ClientId': 'stable-installation-id',
            'X-VSCode-ExtensionName': 'publisher.my-extension',
            'X-VSCode-ExtensionVersion': '2.3.4',
            'X-VSCode-Language': 'zh-cn',
            'X-VSCode-TargetPopulation': 'insider',
        });
    });

    it('maps only the supported assignments parameters, without legacy headers or client metadata', () => {
        fakeVSCode.version = '1.95.0-insider';
        fakeVSCode.env.appName = 'Visual Studio Code - Insiders';
        const provider = new VSCodeAssignmentsFilterProvider(
            'Publisher.My-Extension',
            TargetPopulation.Internal,
        );

        expect(Object.fromEntries(provider.getFilters())).toEqual({
            vscode_core_appversion: '1.95.0',
            vscode_core_build: 'Visual Studio Code - Insiders',
            vscode_core_extensionname: 'Publisher.My-Extension',
            extensionname: 'Publisher.My-Extension',
            vscode_core_targetpopulation: 'internal',
        });
    });

    it.each([
        { population: TargetPopulation.Team, expected: 'team' },
        { population: TargetPopulation.Internal, expected: 'internal' },
        { population: TargetPopulation.Insiders, expected: 'insider' },
        { population: TargetPopulation.Public, expected: 'public' },
    ])(
        'preserves the backend population value $population in both APIs',
        ({ population, expected }) => {
            const legacy = new VSCodeFilterProvider('extension', '1.0.0', population);
            const assignments = new VSCodeAssignmentsFilterProvider('extension', population);

            expect(legacy.getFilterValue(Filters.TargetPopulation)).toBe(expected);
            expect(assignments.getFilters().get(AssignmentsFilters.TargetPopulation)).toBe(
                expected,
            );
        },
    );

    it.each([
        ['1.2.3', '1.2.3'],
        ['0.0.0', '0.0.0'],
        ['1.2.3.4', '1.2.3.4'],
        ['1.2.3-dev', '1.2.3'],
        ['1.2.3-insider', '1.2.3'],
        ['1.2.3-rc.1', '1.2.3'],
        ['1.2.3-beta-preview', '1.2.3'],
        ['1.2.3+build.123', '1.2.3'],
        ['1.2.3-rc.1+build.123', '1.2.3'],
    ])('sends numeric versions for %s on both endpoints', (version, expected) => {
        fakeVSCode.version = version;
        const legacy = new VSCodeFilterProvider('extension', version, TargetPopulation.Public);
        const assignments = new VSCodeAssignmentsFilterProvider(
            'extension',
            TargetPopulation.Public,
        );

        expect({
            legacyApplication: legacy.getFilterValue(Filters.ApplicationVersion),
            legacyExtension: legacy.getFilterValue(Filters.ExtensionVersion),
            assignmentsApplication: assignments
                .getFilters()
                .get(AssignmentsFilters.ApplicationVersion),
        }).toEqual({
            legacyApplication: expected,
            legacyExtension: expected,
            assignmentsApplication: expected,
        });
    });

    it.each([Filters.Market, Filters.CorpNet, 'unknown-filter', ''])(
        'returns an empty value for unavailable filter %s',
        (filter) => {
            const provider = new VSCodeFilterProvider(
                'extension',
                '1.0.0',
                TargetPopulation.Public,
            );

            expect(provider.getFilterValue(filter)).toBe('');
        },
    );

    it('reads host metadata on every call without changing earlier filter snapshots', () => {
        const legacy = new VSCodeFilterProvider('extension', '1.0.0', TargetPopulation.Public);
        const assignments = new VSCodeAssignmentsFilterProvider(
            'extension',
            TargetPopulation.Public,
        );
        const oldLegacy = legacy.getFilters();
        const oldAssignments = assignments.getFilters();

        fakeVSCode.version = '1.96.0';
        fakeVSCode.env.appName = 'Code - OSS';
        fakeVSCode.env.machineId = 'new-installation-id';
        fakeVSCode.env.language = 'de';

        expect(legacy.getFilters().get(Filters.ApplicationVersion)).toBe('1.96.0');
        expect(legacy.getFilters().get(Filters.Build)).toBe('Code - OSS');
        expect(legacy.getFilters().get(Filters.ClientId)).toBe('new-installation-id');
        expect(legacy.getFilters().get(Filters.Language)).toBe('de');
        expect(assignments.getFilters().get(AssignmentsFilters.ApplicationVersion)).toBe('1.96.0');
        expect(assignments.getFilters().get(AssignmentsFilters.Build)).toBe('Code - OSS');
        expect(oldLegacy.get(Filters.ApplicationVersion)).toBe('1.85.0');
        expect(oldAssignments.get(AssignmentsFilters.Build)).toBe('Visual Studio Code');
    });

    it('returns independent maps that callers cannot use to change subsequent filters', () => {
        const legacy = new VSCodeFilterProvider('extension', '1.0.0', TargetPopulation.Public);
        const assignments = new VSCodeAssignmentsFilterProvider(
            'extension',
            TargetPopulation.Public,
        );
        const legacyFilters = legacy.getFilters();
        const assignmentsFilters = assignments.getFilters();

        legacyFilters.set(Filters.ExtensionName, 'overridden');
        assignmentsFilters.clear();

        expect(legacy.getFilters().get(Filters.ExtensionName)).toBe('extension');
        expect(assignments.getFilters().size).toBe(5);
        expect(legacy.getFilters()).not.toBe(legacyFilters);
        expect(assignments.getFilters()).not.toBe(assignmentsFilters);
    });
});
