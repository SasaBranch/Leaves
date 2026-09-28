Pod::Spec.new do |s|
  s.name           = 'PageImageEditor'
  s.version        = '1.0.0'
  s.summary        = 'Perspective correction of saved page images'
  s.description    = 'Perspective correction and rotation of saved page images with Core Image for Leaves (ADR 0023)'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
