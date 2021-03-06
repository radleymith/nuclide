/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 */

import type {AutocompleteCacherConfig} from '../../commons-atom/AutocompleteCacher';

import type {Completion, LanguageService} from './LanguageService';

import {ConnectionCache} from '../../nuclide-remote-connection';
import {trackTiming, track} from '../../nuclide-analytics';
import {getFileVersionOfEditor} from '../../nuclide-open-files';
import AutocompleteCacher from '../../commons-atom/AutocompleteCacher';

export type AutocompleteConfig = {|
  inclusionPriority: number,
  suggestionPriority: number,
  disableForSelector: ?string,
  excludeLowerPriority: boolean,
  version: '2.0.0',
  analyticsEventName: string,
  onDidInsertSuggestionAnalyticsEventName: string,
  autocompleteCacherConfig: ?AutocompleteCacherConfig<?Array<Completion>>,
|};

export class AutocompleteProvider<T: LanguageService> {
  name: string;
  selector: string;
  inclusionPriority: number;
  suggestionPriority: number;
  disableForSelector: ?string;
  excludeLowerPriority: boolean;
  onDidInsertSuggestion: () => mixed;
  _analyticsEventName: string;
  _connectionToLanguageService: ConnectionCache<T>;
  _autocompleteCacher: ?AutocompleteCacher<?Array<Completion>>;

  constructor(
    name: string,
    selector: string,
    inclusionPriority: number,
    suggestionPriority: number,
    disableForSelector: ?string,
    excludeLowerPriority: boolean,
    analyticsEventName: string,
    onDidInsertSuggestionAnalyticsEventName: string,
    autocompleteCacherConfig: ?AutocompleteCacherConfig<?Array<Completion>>,
    connectionToLanguageService: ConnectionCache<T>,
  ) {
    this.name = name;
    this.selector = selector;
    this.inclusionPriority = inclusionPriority;
    this.suggestionPriority = suggestionPriority;
    this.disableForSelector = disableForSelector;
    this.excludeLowerPriority = excludeLowerPriority;
    this._analyticsEventName = analyticsEventName;
    this._connectionToLanguageService = connectionToLanguageService;

    if (autocompleteCacherConfig != null) {
      this._autocompleteCacher = new AutocompleteCacher(
        request => this._getSuggestionsFromLanguageService(request),
        autocompleteCacherConfig,
      );
    }

    this.onDidInsertSuggestion = () => {
      track(onDidInsertSuggestionAnalyticsEventName);
    };
  }

  static register(
    name: string,
    grammars: Array<string>,
    config: AutocompleteConfig,
    connectionToLanguageService: ConnectionCache<T>,
  ): IDisposable {
    return atom.packages.serviceHub.provide(
      'autocomplete.provider',
      config.version,
      new AutocompleteProvider(
        name,
        grammars.map(grammar => '.' + grammar).join(', '),
        config.inclusionPriority,
        config.suggestionPriority,
        config.disableForSelector,
        config.excludeLowerPriority,
        config.analyticsEventName,
        config.onDidInsertSuggestionAnalyticsEventName,
        config.autocompleteCacherConfig,
        connectionToLanguageService,
      ));
  }

  getSuggestions(
    request: atom$AutocompleteRequest,
  ): Promise<?Array<atom$AutocompleteSuggestion>> {
    return trackTiming(
      this._analyticsEventName,
      () => {
        if (this._autocompleteCacher != null) {
          return this._autocompleteCacher.getSuggestions(request);
        } else {
          return this._getSuggestionsFromLanguageService(request);
        }
      });
  }

  async _getSuggestionsFromLanguageService(
    request: atom$AutocompleteRequest,
  ): Promise<?Array<Completion>> {
    const {editor, activatedManually, prefix} = request;
    const position = editor.getLastCursor().getBufferPosition();
    const path = editor.getPath();
    const fileVersion = await getFileVersionOfEditor(editor);

    const languageService = this._connectionToLanguageService.getForUri(path);
    if (languageService == null || fileVersion == null) {
      return [];
    }

    return (await languageService).getAutocompleteSuggestions(
      fileVersion, position, activatedManually == null ? false : activatedManually, prefix);
  }
}
