'use strict'
const conventionalChangelogPresetLoader = require('conventional-changelog-preset-loader')
const gitSemverTags = require('git-semver-tags')

const filterReverted = require('../commit-filter/reverted')
const gitLog = require('../git/git-log')
const parseMessage = require('../message-parser/index')
const presetResolver = require('./preset-resolver')

const VERSIONS = ['major', 'minor', 'patch']

module.exports = conventionalRecommendedBump

function conventionalRecommendedBump(
  optionsArgument,
  parserOptsArgument,
  cbArgument
) {
  if (typeof optionsArgument !== 'object') {
    throw new Error("The 'options' argument must be an object.")
  }

  const options = Object.assign({ ignoreReverted: true }, optionsArgument)

  const cb =
    typeof parserOptsArgument === 'function' ? parserOptsArgument : cbArgument

  if (typeof cb !== 'function') {
    throw new Error('You must provide a callback function.')
  }

  let presetPackage = options.config || {}
  if (options.preset) {
    try {
      presetPackage = conventionalChangelogPresetLoader(options.preset)
    } catch (err) {
      if (err.message === 'does not exist') {
        const preset =
          typeof options.preset === 'object'
            ? options.preset.name
            : options.preset
        return cb(
          new Error(
            `Unable to load the "${preset}" preset package. Please make sure it's installed.`
          )
        )
      } else {
        return cb(err)
      }
    }
  }

  presetResolver(presetPackage)
    .then(config => {
      const whatBump =
        options.whatBump ||
        (config.recommendedBumpOpts && config.recommendedBumpOpts.whatBump) ||
        noop

      if (typeof whatBump !== 'function')
        throw Error('whatBump must be a function')

      const parserOpts = Object.assign(
        {},
        config.parserOpts,
        parserOptsArgument
      )

      const warn =
        typeof parserOpts.warn === 'function' ? parserOpts.warn : noop

      gitSemverTags(
        {
          lernaTags: !!options.lernaPackage,
          package: options.lernaPackage,
          tagPrefix: options.tagPrefix,
          skipUnstable: options.skipUnstable
        },
        async (err, tags) => {
          if (err) return cb(err)

          const rawCommits = await gitLog(tags[0], null, { path: options.path })
          let commits = rawCommits.map(commit =>
            Object.assign(commit, parseMessage(commit.message, parserOpts))
          )
          if (options.ignoreReverted) commits = filterReverted(commits)

          if (!commits || !commits.length) warn('No commits since last release')

          let result = whatBump(commits, options)
          if (result && result.level != null)
            result.releaseType = VERSIONS[result.level]
          else if (result == null) result = {}

          cb(null, result)
        }
      )
    })
    .catch(err => cb(err))
}

function noop() {}
