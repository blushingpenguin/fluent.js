import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import bundleConfig from '../bundle_config';

export default Object.assign({}, bundleConfig, {
  context: 'this',
  output: {
    format: 'cjs',
    preferConst: true,
    banner: `\
/* Copyright 2019 Mozilla Foundation and others
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

`,
  },
  external: [
    "react",
    "prop-types"
  ],
  plugins: [
    nodeResolve(),
    commonjs({
      namedExports: {
        "hoist-non-react-statics": [ "hoistNonReactStatics" ]
      }
    })
  ]
});