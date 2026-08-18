#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Quick test script to verify the Vision AI implementation.

This script tests:
1. Vision service initialization
2. Image type detection
3. Base64 encoding
4. Navigation guide generation
"""

import asyncio
import sys
import os

# Add parent directory to path to allow imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.vision import vision_service
from app.core.app_guide import get_navigation_guide_text, get_mobile_app_guide_text
from app.core.storage import StorageService


def test_vision_service_init():
    """Test that vision service initializes correctly"""
    print("✓ Testing Vision Service Initialization...")
    assert vision_service.enabled == True, "Vision should be enabled by default"
    assert vision_service.model == "google/gemini-2.5-flash", "Default model should be Gemini 2.5 Flash"
    assert vision_service.max_size_bytes == 10 * 1024 * 1024, "Max size should be 10MB"
    print("  ✓ Vision service initialized correctly")


def test_image_type_detection():
    """Test that image MIME type detection works"""
    print("\n✓ Testing Image Type Detection...")
    
    # Test PNG detection
    png_bytes = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100
    detected = StorageService._detect_image_type(png_bytes)
    assert detected == "image/png", f"Should detect PNG, got {detected}"
    print("  ✓ PNG detection works")
    
    # Test JPEG detection
    jpeg_bytes = b'\xff\xd8' + b'\x00' * 100
    detected = StorageService._detect_image_type(jpeg_bytes)
    assert detected == "image/jpeg", f"Should detect JPEG, got {detected}"
    print("  ✓ JPEG detection works")
    
    # Test WEBP detection
    webp_bytes = b'RIFF' + b'\x00' * 4 + b'WEBP' + b'\x00' * 100
    detected = StorageService._detect_image_type(webp_bytes)
    assert detected == "image/webp", f"Should detect WEBP, got {detected}"
    print("  ✓ WEBP detection works")
    
    # Test unknown type (should default to JPEG)
    unknown_bytes = b'\x00\x00\x00\x00' + b'\x00' * 100
    detected = StorageService._detect_image_type(unknown_bytes)
    assert detected == "image/jpeg", f"Should default to JPEG, got {detected}"
    print("  ✓ Unknown type defaults to JPEG")


def test_base64_encoding():
    """Test that base64 encoding works"""
    print("\n✓ Testing Base64 Encoding...")
    
    test_bytes = b'test image data'
    mime_type = "image/jpeg"
    data_url = vision_service._bytes_to_data_url(test_bytes, mime_type)
    
    assert data_url.startswith("data:image/jpeg;base64,"), "Should start with correct data URL prefix"
    assert len(data_url) > len(test_bytes), "Base64 encoded should be longer"
    print("  ✓ Base64 encoding works correctly")


def test_navigation_guide_text():
    """Test that navigation guide text generation works"""
    print("\n✓ Testing Connect Hub Navigation Guide...")
    
    guide_text = get_navigation_guide_text()
    
    assert "Connect Hub App In-App Navigation Guide" in guide_text, "Should contain guide header"
    assert "/dashboard" in guide_text, "Should contain dashboard route"
    assert "/sessions" in guide_text, "Should contain sessions route"
    assert "لوحة التحكم" in guide_text, "Should contain Arabic names"
    print("  ✓ Navigation guide text generated correctly")


def test_mobile_app_guide_text():
    """Test that mobile app guide text generation works"""
    print("\n✓ Testing Islami Mobile App Guide...")
    
    guide_text = get_mobile_app_guide_text()
    
    assert "Islami Mobile App Navigation Guide" in guide_text, "Should contain guide header"
    assert "تسجيل الدخول" in guide_text, "Should contain Arabic login screen"
    assert "التحويلات" in guide_text, "Should contain Arabic transfers screen"
    assert "Security Rules" in guide_text, "Should contain security rules section"
    print("  ✓ Mobile app guide text generated correctly")


def test_llm_navigation_detection():
    """Test that LLM can detect navigation queries"""
    print("\n✓ Testing Navigation Query Detection...")
    
    from app.core.llm import LLMService
    
    # Test mobile app navigation query
    assert LLMService._is_mobile_app_navigation_query("كيف أحول فلوس؟") == True, "Should detect Arabic nav + feature"
    assert LLMService._is_mobile_app_navigation_query("how do I transfer money?") == True, "Should detect English nav + feature"
    assert LLMService._is_mobile_app_navigation_query("transfer money") == False, "Should NOT detect without nav intent"
    assert LLMService._is_mobile_app_navigation_query("my balance is wrong") == False, "Should NOT detect complaint as nav"
    print("  ✓ Mobile app navigation detection works")
    
    # Test dashboard navigation query
    assert LLMService._is_dashboard_navigation_query("how do I see sessions?") == True, "Should detect dashboard query"
    assert LLMService._is_dashboard_navigation_query("وين الإعدادات؟") == True, "Should detect Arabic dashboard query"
    print("  ✓ Dashboard navigation detection works")


def main():
    """Run all tests"""
    print("=" * 60)
    print("Testing Vision AI Implementation")
    print("=" * 60)
    
    try:
        test_vision_service_init()
        test_image_type_detection()
        test_base64_encoding()
        test_navigation_guide_text()
        test_mobile_app_guide_text()
        test_llm_navigation_detection()
        
        print("\n" + "=" * 60)
        print("✓ All tests passed!")
        print("=" * 60)
        return 0
        
    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
